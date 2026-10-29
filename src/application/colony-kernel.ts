/**
 * ColonyKernel — the public command/query seam (N13). Commands validate
 * actor/role/capability, construct deterministic events, and commit through
 * ColonyStorage.atomicApply. Queries are read-only projections.
 */
import { KernelError, unwrap } from "../domain/errors/kernel-error.js";
import { canonicalPayloadHash, applyEvent, reduceAll } from "../domain/events/apply-event.js";
import type { EventEnvelope, EventActor } from "../domain/events/envelope.js";
import { EventType as ET } from "../domain/events/vocabulary.js";
import { initialMissionState } from "../domain/mission/mission-state.js";
import type { MissionState } from "../domain/mission/mission-state.js";
import type { ColonyStorage } from "../ports/storage.js";
import type { Clock, IdGenerator, TelemetrySink } from "../ports/kernel-ports.js";
import type { AgentRuntime, AgentInvocation, AgentInvocationRecord } from "../ports/agent-runtime.js";
import type { RoleRegistry } from "../domain/capabilities/registry.js";
import { testRoleRegistry, CAPABILITY_MANIFESTS } from "../domain/capabilities/registry.js";
import type { CapabilityId } from "../domain/capabilities/registry.js";
import type { ArtifactContent, ArtifactType, ArtifactManifest } from "../domain/artifacts/artifact.js";
import { canonicalArtifactContent } from "../domain/artifacts/artifact.js";
import { sha256Hex } from "../domain/support/sha256.js";
import type {
  ApprovalRequest,
  ApprovalRecord,
  ApprovalPurpose,
  ActionClass,
  ArtifactSubjectRef,
} from "../domain/approvals/approval.js";
import { approvalSubjectHash, isHumanAuthority, isExpiredAtCommit, sortArtifactSubjects } from "../domain/approvals/approval.js";
import type { ResourceClass, BudgetLedger } from "../domain/budgets/ledger.js";
import {
  freshLedger,
  reserve,
  settle,
  release,
  applyTopUp,
  ledgerView,
  TOPUP_FORBIDDEN_CLASSES,
  TOPUP_ALLOWED_CLASSES,
} from "../domain/budgets/ledger.js";
import type { RevisionRequest, RevisionIssueCode } from "../domain/revisions/revision.js";
import { revisionDedupeKey } from "../domain/revisions/revision.js";

export interface KernelServices {
  storage: ColonyStorage;
  clock: Clock;
  ids: IdGenerator;
  telemetry: TelemetrySink;
  runtime: AgentRuntime;
  roles?: RoleRegistry;
}

// The agent identities that may never approve. The list lives in the domain's
// role registry (one home per fact) and is derived from the registry's own
// manifests, so it cannot be empty and cannot drift from the roles the kernel
// actually knows — see finding F1 in reports/INDEPENDENT_REVIEW_1A.md.
const HUMAN_AUTHORITY = "captain";

export class ColonyKernel {
  // Private on purpose: the host keeps the instance it injected for reads, but
  // the kernel must not hand out raw writers (appendEvent, recordApprovalDecision,
  // createApprovalRequest) that bypass every guard.
  private readonly storage: ColonyStorage;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly telemetry: TelemetrySink;
  readonly runtime: AgentRuntime;
  readonly roles: RoleRegistry;

  constructor(services: KernelServices) {
    this.storage = services.storage;
    this.clock = services.clock;
    this.ids = services.ids;
    this.telemetry = services.telemetry;
    this.runtime = services.runtime;
    this.roles = services.roles ?? testRoleRegistry();
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private now(): string {
    return this.clock.now().toISOString();
  }

  private envelope(
    eventType: ET,
    state: MissionState,
    actor: EventActor,
    payload: Record<string, unknown>,
    opts: { correlationId: string; causationId?: string | null; idempotencyKey: string },
  ): EventEnvelope {
    const occurredAt = this.now();
    const envelope: EventEnvelope = {
      schemaVersion: 1,
      eventId: this.ids.nextUuid(),
      eventType,
      missionId: state.missionId,
      missionSequence: state.missionSequence + 1,
      expectedStateVersion: state.stateVersion,
      actor,
      causationId: opts.causationId ?? null,
      correlationId: opts.correlationId,
      idempotencyKey: opts.idempotencyKey,
      occurredAt,
      recordedAt: occurredAt,
      payload,
      payloadSha256: canonicalPayloadHash(payload),
    };
    return envelope;
  }

  private current(missionId: string): MissionState {
    const state = unwrap(this.storage.getMissionState(missionId));
    if (state === undefined) throw new KernelError("INVALID_EVENT", `mission ${missionId} not found`, {});
    return state;
  }

  private actorFor(roleId: string | null, actorType: EventActor["actorType"], actorId: string): EventActor {
    const role = roleId === null ? null : this.roles.role(roleId);
    return {
      actorType,
      actorId,
      roleId: role === null ? null : role.roleId,
      roleVersion: role === null ? null : role.roleVersion,
    };
  }

  /**
   * One home for the per-command transition entry (ARCHITECTURE.md, "Control flow
   * of one command": … → telemetry record → return). A command that commits
   * through {@link commit} gets this for free; a command that must commit through
   * `storage.atomicApply` itself calls it explicitly. Telemetry is a derived view
   * and never authorizes anything (v0.1 §15), so emitting it cannot change a gate.
   */
  private noteTransition(missionId: string, state: MissionState, appended: number): void {
    this.telemetry.record({
      kind: "transition",
      missionId,
      code: state.stage,
      detail: { stateVersion: state.stateVersion, events: appended },
    });
  }

  /** The approval-gate entry both human gates emit once their request committed. */
  private noteApprovalRequested(missionId: string, request: ApprovalRequest): void {
    this.telemetry.record({
      kind: "approval",
      missionId,
      code: "APPROVAL_REQUESTED",
      detail: { subjectHash: approvalSubjectHash(request) },
    });
  }

  /** Commit an event batch atomically; telemetry + durable rejection on failure. */
  private commit(
    missionId: string,
    build: (state: MissionState) => {
      events: EventEnvelope[];
      reduce?: typeof applyEvent;
      /** Rows that must land with the events or not at all (see atomicApply). */
      effects?: (committed: MissionState) => void;
    },
  ): MissionState {
    const pre = this.current(missionId);
    const { events, reduce, effects } = build(pre);
    // Legality precedes storage uniqueness (A04): reject without any mutation,
    // durably, before unique-constraint errors can mask the semantic cause.
    try {
      applyEvent(pre, events[0] as EventEnvelope);
    } catch (e) {
      if (e instanceof KernelError) {
        unwrap(
          this.storage.recordRejection({
            missionId,
            scope: "transition",
            code: e.code,
            detail: e.toJSON().details,
            occurredAt: this.now(),
          }),
        );
        this.telemetry.record({ kind: "rejection", missionId, code: e.code, detail: e.toJSON() });
        throw e;
      }
      throw e;
    }
    const result = this.storage.atomicApply(missionId, events, pre.stateVersion, reduce ?? applyEvent, effects);
    if (!result.ok) {
      this.telemetry.record({ kind: "rejection", missionId, code: result.error.code, detail: result.error.toJSON() });
      unwrap(
        this.storage.recordRejection({
          missionId,
          scope: "atomicApply",
          code: result.error.code,
          detail: { message: result.error.message, detail: result.error.details },
          occurredAt: this.now(),
        }),
      );
      throw result.error;
    }
    const state = result.value.state;
    this.noteTransition(missionId, state, result.value.appended);
    return state;
  }

  // ── commands: lifecycle ────────────────────────────────────────────────

  createMission(input: { title: string; correlationId?: string }): { missionId: string; state: MissionState } {
    const missionId = this.ids.nextId("mission");
    const envelope: EventEnvelope = {
      schemaVersion: 1,
      eventId: this.ids.nextUuid(),
      eventType: ET.MISSION_CREATED,
      missionId,
      missionSequence: 1,
      expectedStateVersion: 0,
      actor: this.actorFor("first-mate", "CAPTAIN_TRANSPORT", "captain-transport"),
      causationId: null,
      correlationId: input.correlationId ?? this.ids.nextId("corr"),
      idempotencyKey: `mission:${missionId}:create`,
      occurredAt: this.now(),
      recordedAt: this.now(),
      payload: { title: input.title },
      payloadSha256: canonicalPayloadHash({ title: input.title }),
    };
    const applied = this.storage.atomicApply(missionId, [envelope], 0, applyEvent);
    if (!applied.ok) throw applied.error;
    this.telemetry.record({ kind: "transition", missionId, code: "CREATED", detail: {} });
    return { missionId, state: applied.value.state };
  }

  abortMission(missionId: string, reason: string): MissionState {
    return this.commit(missionId, (state) => ({
      events: [
        this.envelope(ET.MISSION_ABORTED, state, this.actorFor(null, "CAPTAIN_TRANSPORT", "captain-transport"), { reason }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `mission:${missionId}:abort:${state.stateVersion}`,
        }),
      ],
    }));
  }

  failMission(missionId: string, reason: string): MissionState {
    return this.commit(missionId, (state) => ({
      events: [
        this.envelope(ET.MISSION_FAILED, state, this.actorFor(null, "KERNEL_POLICY", "kernel"), { reason }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `mission:${missionId}:fail:${state.stateVersion}`,
        }),
      ],
    }));
  }

  // ── commands: stage progression ────────────────────────────────────────

  private stage(missionId: string, eventType: ET, roleId: string | null, payload: Record<string, unknown>, idemBase: string, capability?: CapabilityId): MissionState {
    if (capability !== undefined) {
      this.roles.assertCapability(roleId ?? "unknown", capability);
    }
    // Key embeds the observed state version: identical command at the same
    // version replays idempotently; a new cycle commits as a new command.
    return this.commit(missionId, (state) => ({
      events: [
        this.envelope(eventType, state, this.actorFor(roleId, "ADMITTED_INVOCATION", roleId ?? "kernel"), payload, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `${idemBase}:v${state.stateVersion}`,
        }),
      ],
    }));
  }

  startMission(missionId: string): MissionState {
    return this.stage(missionId, ET.POLICY_SCREEN_STARTED, "first-mate", {}, `mission:${missionId}:start`);
  }

  completePolicyScreen(missionId: string, verdict: "allowed" | "rejected" | "unenforceable", detail: Record<string, unknown> = {}): MissionState {
    return this.stage(missionId, ET.POLICY_SCREEN_COMPLETED, "first-mate", { verdict, ...detail }, `mission:${missionId}:policy:${verdict}`, "screen_policy");
  }

  startRecon(missionId: string, branch: string): MissionState {
    return this.stage(missionId, ET.RECON_STARTED, "first-mate", { branch }, `mission:${missionId}:recon-start:${branch}`, "conduct_reconnaissance");
  }

  completeRecon(missionId: string, artifactId: string): MissionState {
    return this.stage(missionId, ET.RECON_COMPLETED, "first-mate", { reconArtifactId: artifactId }, `mission:${missionId}:recon-complete`, "conduct_reconnaissance");
  }

  proposePlan(missionId: string, planSha: string): MissionState {
    return this.stage(missionId, ET.PLAN_PROPOSED, "first-mate", { planSha256: planSha }, `mission:${missionId}:plan`, "propose_plan");
  }

  challengePlan(missionId: string, artifactId: string): MissionState {
    return this.stage(missionId, ET.PLAN_CHALLENGED, "reviewer", { challengeArtifactId: artifactId }, `mission:${missionId}:challenge`, "challenge_plan");
  }

  revisePlan(missionId: string, newPlanSha: string, newEvidence: string): MissionState {
    return this.stage(
      missionId,
      ET.PLAN_REVISED,
      "first-mate",
      { planSha256: newPlanSha, newEvidence },
      `mission:${missionId}:plan-revise:${sha256Hex(newEvidence)}`,
      "propose_plan",
    );
  }

  // ── approvals (N1) ─────────────────────────────────────────────────────

  /**
   * One home for the approval-request shape both human gates issue. Only the
   * purpose and the guarded exit differ; every other field is N1-invariant.
   * `approvalSubjectHash` covers all of it, so callers must not mutate the result.
   */
  private openApprovalRequest(
    state: MissionState,
    input: { artifactSubjects: readonly ArtifactSubjectRef[]; requestedByRole: { roleId: string; roleVersion: number }; ttlMs: number },
    purpose: ApprovalPurpose,
    toState: string,
    options?: { actionClass?: ActionClass; budgetTopUp?: { resourceClass: ResourceClass; amount: number } },
  ): { request: ApprovalRequest; envelope: EventEnvelope } {
    const request: ApprovalRequest = {
      schemaVersion: 1,
      approvalRequestId: this.ids.nextUuid(),
      missionId: state.missionId,
      missionStateVersion: state.stateVersion,
      requestedTransition: { fromState: state.stage, toState },
      approvalPurpose: purpose,
      actionClass: options?.actionClass ?? "LOCAL_WRITE",
      ...(options?.budgetTopUp === undefined ? {} : { budgetTopUp: options.budgetTopUp }),
      requestedByRole: input.requestedByRole,
      requiredHumanAuthority: HUMAN_AUTHORITY,
      artifactSubjects: sortArtifactSubjects(input.artifactSubjects),
      policyVersion: "v0.1.1",
      roleVersions: { "first-mate": 1, craftsman: 1, verifier: 1, reviewer: 1 },
      issuedAt: this.now(),
      expiresAt: new Date(this.clock.now().getTime() + input.ttlMs).toISOString(),
      nonce: this.ids.nextNonce(),
    };
    const envelope = this.envelope(
      ET.APPROVAL_REQUESTED,
      state,
      this.actorFor(input.requestedByRole.roleId, "ADMITTED_INVOCATION", input.requestedByRole.roleId),
      { approvalRequestId: request.approvalRequestId, approvalSubjectHash: approvalSubjectHash(request), purpose: request.approvalPurpose },
      { correlationId: this.ids.nextId("corr"), idempotencyKey: `approval:${request.approvalRequestId}:requested` },
    );
    return { request, envelope };
  }

  /** One home for the record shape both approval-decision paths store. */
  private buildApprovalRecord(
    request: ApprovalRequest,
    input: { decision: "APPROVED" | "REJECTED"; decidedBy: string; reason?: string },
  ): ApprovalRecord {
    return {
      schemaVersion: 1,
      approvalRecordId: this.ids.nextUuid(),
      approvalRequestId: request.approvalRequestId,
      approvalSubjectHash: approvalSubjectHash(request),
      decision: input.decision,
      decidedBy: input.decidedBy,
      decidedAt: this.now(),
      authorityProof: { method: "deterministic-test-authority", reference: "captain-test-key" },
      optionalReason: input.reason ?? null,
    };
  }

  /**
   * N1 reqs 6-7 / A07: a request authorizes only the gate it was issued for.
   * The request's own APPROVAL_REQUESTED commit is the +1; any later event
   * makes it stale. Purpose must match the gate (PLAN vs PACKAGE).
   */
  private assertApprovalBindsGate(request: ApprovalRequest, state: MissionState): void {
    const expected =
      state.stage === "AWAITING_PLAN_APPROVAL"
        ? "PLAN_APPROVAL"
        : state.stage === "AWAITING_PUBLISH_APPROVAL"
          ? "PACKAGE_APPROVAL"
          : null;
    if (expected === null || request.approvalPurpose !== expected) {
      throw new KernelError("INVALID_PURPOSE", `approval purpose ${request.approvalPurpose} does not match gate ${state.stage}`, {
        approvalPurpose: request.approvalPurpose,
        gate: state.stage,
      });
    }
    if (request.requestedTransition.fromState !== state.stage) {
      throw new KernelError("STALE_APPROVAL", `approval issued from ${request.requestedTransition.fromState}; gate is ${state.stage}`, {
        issuedFrom: request.requestedTransition.fromState,
        gate: state.stage,
      });
    }
    if (request.missionStateVersion + 1 !== state.stateVersion) {
      throw new KernelError("STALE_APPROVAL", `approval issued at state ${request.missionStateVersion + 1}; current is ${state.stateVersion}`, {
        issuedAt: request.missionStateVersion + 1,
        current: state.stateVersion,
      });
    }
  }

  /**
   * A gate approves the mission's own finalized artifacts. Every subject must
   * exist, belong to this mission, and match the stored manifest; the gate's
   * bound outputs must be present (A07: wrong-mission subjects cannot authorize).
   */
  private assertApprovalSubjects(
    state: MissionState,
    subjects: readonly ArtifactSubjectRef[],
    required: readonly { hash: string | null; artifactType: ArtifactType; label: string }[],
  ): void {
    for (const subject of subjects) {
      const artifact = unwrap(this.storage.getArtifact(subject.artifactId));
      if (artifact === undefined || artifact.missionId !== state.missionId) {
        throw new KernelError("INVALID_SCHEMA", `approval subject ${subject.artifactId} is not an artifact of mission ${state.missionId}`, {
          artifactId: subject.artifactId,
        });
      }
      if (
        artifact.artifactType !== subject.artifactType ||
        artifact.contentSha256 !== subject.contentSha256 ||
        artifact.finalizedAt !== subject.finalizedAt
      ) {
        throw new KernelError("STALE_APPROVAL", `approval subject ${subject.artifactId} does not match the stored artifact`, {
          artifactId: subject.artifactId,
        });
      }
    }
    for (const item of required) {
      if (item.hash === null) {
        throw new KernelError("INVALID_SCHEMA", `${item.label} is not bound; the gate cannot be requested yet`, {});
      }
      if (!subjects.some((s) => s.artifactType === item.artifactType && s.contentSha256 === item.hash)) {
        throw new KernelError("INVALID_SCHEMA", `${item.label} must be one of the approval subjects`, {});
      }
    }
  }

  /**
   * N1 req 11 / E13,E29: an expired gate pauses for human review, durably.
   * Called only after the expiry refusal is on the record, so the pause cannot
   * mask the refusal. Recovery re-enters the gate (E36) for a bounded reissue.
   */
  private pauseOnExpiry(request: ApprovalRequest, state: MissionState): void {
    const event = this.envelope(
      ET.APPROVAL_EXPIRED,
      state,
      this.actorFor(null, "KERNEL_POLICY", "kernel"),
      { approvalRequestId: request.approvalRequestId },
      { correlationId: this.ids.nextId("corr"), idempotencyKey: `approval:${request.approvalRequestId}:expired` },
    );
    const committed = this.storage.atomicApply(request.missionId, [event], state.stateVersion, applyEvent);
    if (!committed.ok) throw committed.error;
    this.noteTransition(request.missionId, committed.value.state, committed.value.appended);
  }

  requestPlanApproval(input: { missionId: string; artifactSubjects: readonly ArtifactSubjectRef[]; requestedByRole: { roleId: string; roleVersion: number }; ttlMs: number }): ApprovalRequest {
    const state = this.current(input.missionId);
    if (state.stage !== "AWAITING_PLAN_APPROVAL") {
      throw new KernelError("ILLEGAL_TRANSITION", `approval requests originate from AWAITING_PLAN_APPROVAL, not ${state.stage}`, {});
    }
    this.assertApprovalSubjects(state, input.artifactSubjects, [
      { hash: state.boundPlanSha256, artifactType: "plan", label: "the bound plan" },
    ]);
    const { request, envelope } = this.openApprovalRequest(state, input, "PLAN_APPROVAL", "IMPLEMENTATION");
    const committed = this.storage.atomicApply(input.missionId, [envelope], state.stateVersion, applyEvent, () => {
      // A gate event without its request row is a gate nobody can answer: the
      // row is an effect of this commit, not a follow-up write.
      unwrap(this.storage.createApprovalRequest(request));
    });
    if (!committed.ok) throw committed.error;
    this.noteApprovalRequested(input.missionId, request);
    return request;
  }

  /** Captain decision (deterministic test authority in M1A). */
  recordApprovalDecision(input: { approvalRequestId: string; decision: "APPROVED" | "REJECTED"; decidedBy: string; reason?: string; requestedChange?: boolean }): ApprovalRecord {
    const request = unwrap(this.storage.getApprovalRequest(input.approvalRequestId));
    if (request === undefined) throw new KernelError("APPROVAL_NOT_FOUND", `approval ${input.approvalRequestId} not found`, {});
    if (
      !isHumanAuthority(input.decidedBy, this.roles.roleIds(), request.requiredHumanAuthority)
    ) {
      throw new KernelError("SELF_APPROVAL_DENIED", `identity ${input.decidedBy} is not the required human authority ${request.requiredHumanAuthority}`, { decidedBy: input.decidedBy });
    }
    // N1 reqs 5-7 / A05: if an APPROVED record already exists, the live request
    // must still match it. A request mutated after the record was built (artifact
    // content changed, target transition edited) must not authorize — refuse
    // STALE_APPROVAL before anything else, including the idempotent replay.
    // This is checked here, before buildApprovalRecord, because the replay path
    // below would otherwise return the stale approval as if it were valid.
    const existing = unwrap(this.storage.getApprovalRecordByRequest(input.approvalRequestId));
    if (existing !== undefined && existing.decision === "APPROVED" && input.decision === "APPROVED") {
      if (approvalSubjectHash(request) !== existing.approvalSubjectHash) {
        throw new KernelError("STALE_APPROVAL", `approval ${input.approvalRequestId} subject changed since the record was built`, {
          approvalRequestId: input.approvalRequestId,
          recordedHash: existing.approvalSubjectHash,
          currentHash: approvalSubjectHash(request),
        });
      }
    }
    // Idempotent replay: an identical decision already recorded returns the
    // original record without emitting a second transition event (N1). An
    // APPROVED record that has expired is never returned as granted, not even
    // on replay (N1 req 8 / A07).
    if (existing !== undefined && existing.decision === input.decision) {
      if (existing.decision === "APPROVED" && isExpiredAtCommit(request, this.clock.now())) {
        throw new KernelError("EXPIRED_AT_COMMIT", `approval ${input.approvalRequestId} expired at commit`, {
          approvalRequestId: input.approvalRequestId,
          expiresAt: request.expiresAt,
        });
      }
      return existing;
    }
    const state = this.current(request.missionId);
    // N1 reqs 6-7 / A07: a decision is legal only for the gate that is open NOW.
    // A request left pending at an earlier gate must not authorize a later one.
    this.assertApprovalBindsGate(request, state);
    const record = this.buildApprovalRecord(request, input);
    unwrap(this.storage.recordApprovalDecision(record));
    const envelope = this.envelope(
      // E12/E27: a rejection that asks for no change ends the mission. The edge
      // table's exit for that decision is MISSION_CLOSED (matched on
      // decision=REJECTED); APPROVAL_RECORDED has no such exit, so a plain "no"
      // used to throw ILLEGAL_TRANSITION and leave the mission at the gate.
      record.decision === "REJECTED" && input.requestedChange !== true
        ? ET.MISSION_CLOSED
        : ET.APPROVAL_RECORDED,
      state,
      this.actorFor(null, "CAPTAIN_TRANSPORT", input.decidedBy),
      {
        decision: record.decision,
        approvalRecordId: record.approvalRecordId,
        approvalSubjectHash: record.approvalSubjectHash,
        requestedChange: input.requestedChange === true,
      },
      { correlationId: this.ids.nextId("corr"), idempotencyKey: `approval:${request.approvalRequestId}:recorded` },
    );
    // The APPROVAL_RECORDED event performs the guarded stage exit; consumption
    // of the record is transactional with this commit inside atomicApply.
    // Legality precedes storage (A04), mirroring commit(): a guarded exit that
    // fails (e.g. exhausted counter) rejects durably with no state change.
    let committedStage = state.stage;
    try {
      // N1 req 6: an approved record past its expiresAt must not authorize the
      // transition — expiry is judged at commit time against the injected clock.
      if (record.decision === "APPROVED" && isExpiredAtCommit(request, this.clock.now())) {
        throw new KernelError("EXPIRED_AT_COMMIT", `approval ${request.approvalRequestId} expired at commit`, {
          approvalRequestId: request.approvalRequestId,
          expiresAt: request.expiresAt,
        });
      }
      // N1 reqs 5-7 / A05: the approval is bound to the EXACT subject it was
      // issued for. Recompute the subject hash from the live stored request and
      // reject if it no longer matches the record — a request mutated after the
      // record was built (artifact content changed, target transition edited)
      // must not authorize this commit. STALE_APPROVAL is the durable refusal.
      if (record.decision === "APPROVED") {
        const currentSubjectHash = approvalSubjectHash(request);
        if (currentSubjectHash !== record.approvalSubjectHash) {
          throw new KernelError("STALE_APPROVAL", `approval ${request.approvalRequestId} subject changed since the record was built`, {
            approvalRequestId: request.approvalRequestId,
            recordedHash: record.approvalSubjectHash,
            currentHash: currentSubjectHash,
          });
        }
      }
      committedStage = applyEvent(state, envelope).stage;
    } catch (e) {
      if (e instanceof KernelError) {
        unwrap(
          this.storage.recordRejection({
            missionId: request.missionId,
            scope: "approval-recorded",
            code: e.code,
            detail: e.toJSON().details,
            occurredAt: this.now(),
          }),
        );
        this.telemetry.record({ kind: "rejection", missionId: request.missionId, code: e.code, detail: e.toJSON() });
        if (e.code === "EXPIRED_AT_COMMIT") {
          // E13/E29: the refusal is already durable; now pause the mission.
          this.pauseOnExpiry(request, state);
        }
      }
      throw e;
    }
    // Consumption is an effect of the guarded exit: it lands with the
    // APPROVAL_RECORDED event or not at all. The record itself was stored above
    // and survives a refusal (C-04, C-10): an expired or refused approval stays
    // auditable and unconsumed.
    const committed = this.storage.atomicApply(request.missionId, [envelope], state.stateVersion, applyEvent, () => {
      if (record.decision === "APPROVED") {
        unwrap(this.storage.consumeApproval(record.approvalRecordId, `${state.stage}->${committedStage}`, this.now()));
      }
    });
    if (!committed.ok) throw committed.error;
    this.telemetry.record({ kind: "approval", missionId: request.missionId, code: record.decision, detail: { subjectHash: record.approvalSubjectHash } });
    return record;
  }

  /** Record-level decision without a transition event (test/audit seam).
   *
   * This is NOT a lesser-trusted path: it records an APPROVED decision that
   * `applyBudgetTopUp` and the guarded gate both consume. It carries the same
   * authority guard as `recordApprovalDecision` — an agent identity can never
   * approve, on any public path. The "test/audit seam" label describes the
   * missing transition event, not a relaxation of who may decide. */
  recordApprovalDecisionRaw(input: { approvalRequestId: string; decision: "APPROVED" | "REJECTED"; decidedBy: string; reason?: string }): ApprovalRecord {
    const request = unwrap(this.storage.getApprovalRequest(input.approvalRequestId));
    if (request === undefined) throw new KernelError("APPROVAL_NOT_FOUND", `approval ${input.approvalRequestId} not found`, {});
    if (
      !isHumanAuthority(input.decidedBy, this.roles.roleIds(), request.requiredHumanAuthority)
    ) {
      throw new KernelError("SELF_APPROVAL_DENIED", `identity ${input.decidedBy} is not the required human authority ${request.requiredHumanAuthority}`, { decidedBy: input.decidedBy });
    }
    const record = this.buildApprovalRecord(request, input);
    const stored = this.storage.recordApprovalDecision(record);
    if (!stored.ok) throw stored.error;
    return record;
  }

  // ── artifacts ──────────────────────────────────────────────────────────

  finalizeArtifact(input: { missionId: string; roleId: string; artifactType: ArtifactType; content: ArtifactContent; artifactId?: string; slot?: "plan" | "candidate" | "verification" }): { manifest: ArtifactManifest; contentSha256: string } {
    const buildManifest = (a: { artifactId: string; missionId: string; artifactType: ArtifactType; content: ArtifactContent; roleId: string; roleVersion: number; finalizedAt: string; contentSha256: string }): ArtifactManifest => {
      return {
        schemaVersion: 1 as const,
        artifactId: a.artifactId,
        missionId: a.missionId,
        artifactType: a.artifactType,
        contentSha256: a.contentSha256,
        createdByRoleId: a.roleId,
        createdByRoleVersion: a.roleVersion,
        finalizedAt: a.finalizedAt,
        contentBytes: new TextEncoder().encode(canonicalArtifactContent(a.content)).length,
      };
    }
    // Precondition: the mission must exist before an artifact can be finalized.
    this.current(input.missionId);
    const role = this.roles.role(input.roleId);
    // A16 / role contract: a role finalizes only the artifact types its own
    // capabilities produce; the capability manifests are the one home for that
    // mapping (deny-by-default, no caller-declared scope).
    const produced = CAPABILITY_MANIFESTS
      .filter((capability) => role.capabilities.includes(capability.capabilityId))
      .flatMap((capability) => capability.producesArtifactTypes);
    if (!produced.includes(input.artifactType)) {
      throw new KernelError("CAPABILITY_DENIED", `role ${role.roleId} cannot produce ${input.artifactType}`, {
        roleId: role.roleId,
        artifactType: input.artifactType,
      });
    }
    const contentSha256 = sha256Hex(canonicalArtifactContent(input.content));
    const artifactId = input.artifactId ?? this.ids.nextId("artifact");
    const manifest = buildManifest({
      artifactId,
      missionId: input.missionId,
      artifactType: input.artifactType,
      content: input.content,
      roleId: role.roleId,
      roleVersion: role.roleVersion,
      finalizedAt: this.now(),
      contentSha256,
    });
    unwrap(this.storage.finalizeArtifact(manifest));
    const payload: Record<string, unknown> = {
      artifactId,
      artifactType: input.artifactType,
      contentSha256,
    };
    if (input.slot !== undefined) {
      payload["bindSlot"] = input.slot;
      payload["bindSubjectSha256"] = contentSha256;
    }
    this.commit(input.missionId, (s) => ({
      events: [
        this.envelope(ET.ARTIFACT_FINALIZED, s, this.actorFor(input.roleId, "ADMITTED_INVOCATION", input.roleId), payload, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `artifact:${artifactId}:finalized`,
        }),
      ],
    }));
    return { manifest, contentSha256 };
  }

  // ── budget ledger (N4) ─────────────────────────────────────────────────

  setBudgetLimit(missionId: string, resourceClass: ResourceClass, immutableLimit: number): void {
    unwrap(this.storage.upsertLedger(missionId, resourceClass, 0, freshLedger(missionId, resourceClass, immutableLimit)));
  }

  ledger(missionId: string, resourceClass: ResourceClass): BudgetLedger {
    const ledger = unwrap(this.storage.getLedger(missionId, resourceClass));
    if (ledger === undefined) throw new KernelError("INVALID_EVENT", `no ledger row for ${missionId}/${resourceClass}`, {});
    return ledger;
  }

  reserveBudget(missionId: string, resourceClass: ResourceClass, amount: number): BudgetLedger {
    const ledger = this.ledger(missionId, resourceClass);
    const next = unwrap(attemptLedger(() => reserve(ledger, amount)));
    this.commit(missionId, (s) => ({
      events: [
        this.envelope(ET.BUDGET_RESERVED, s, this.actorFor(null, "KERNEL_POLICY", "kernel"), { resourceClass, amount, reserved: next.reserved }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `budget:${missionId}:${resourceClass}:reserve:v${s.stateVersion}`,
        }),
      ],
      // The row is an effect: it lands with BUDGET_RESERVED or not at all, so a
      // refused transition cannot spend capacity the event log never records.
      effects: () => {
        unwrap(this.storage.upsertLedger(missionId, resourceClass, ledger.ledgerVersion, next));
      },
    }));
    this.telemetry.record({ kind: "budget", missionId, code: "BUDGET_RESERVED", detail: { resourceClass, amount } });
    return next;
  }

  settleBudget(missionId: string, resourceClass: ResourceClass, amount: number): BudgetLedger {
    const ledger = this.ledger(missionId, resourceClass);
    const next = unwrap(attemptLedger(() => settle(ledger, "inv", amount)));
    this.commit(missionId, (s) => ({
      events: [
        this.envelope(ET.BUDGET_SETTLED, s, this.actorFor(null, "KERNEL_POLICY", "kernel"), { resourceClass, amount, spent: next.spent }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `budget:${missionId}:${resourceClass}:settle:v${s.stateVersion}`,
        }),
      ],
      effects: () => {
        unwrap(this.storage.upsertLedger(missionId, resourceClass, ledger.ledgerVersion, next));
      },
    }));
    this.telemetry.record({ kind: "budget", missionId, code: "BUDGET_SETTLED", detail: { resourceClass, amount } });
    return next;
  }

  releaseBudget(missionId: string, resourceClass: ResourceClass, amount: number): BudgetLedger {
    const ledger = this.ledger(missionId, resourceClass);
    const next = unwrap(attemptLedger(() => release(ledger, amount)));
    this.commit(missionId, (s) => ({
      events: [
        this.envelope(ET.BUDGET_RELEASED, s, this.actorFor(null, "KERNEL_POLICY", "kernel"), { resourceClass, amount }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `budget:${missionId}:${resourceClass}:release:v${s.stateVersion}`,
        }),
      ],
      effects: () => {
        unwrap(this.storage.upsertLedger(missionId, resourceClass, ledger.ledgerVersion, next));
      },
    }));
    return next;
  }

  /** Top-up requires a consumed BUDGET_TOPUP ApprovalRecord (N4 req 3, 11). */
  /**
   * Request a human top-up approval with its terms (N4 reqs 3/11). A top-up is
   * an approval artifact, not a state transition: N10 has no APPROVAL_REQUESTED
   * edge outside the two gates, so the request row is stored and the
   * BUDGET_TOPUP_APPROVED event records the consumption. The terms live inside
   * the content-addressed request, so the approval hash binds the class/amount.
   */
  requestBudgetTopUp(input: { missionId: string; resourceClass: ResourceClass; amount: number; requestedByRole: { roleId: string; roleVersion: number }; ttlMs: number }): ApprovalRequest {
    const state = this.current(input.missionId);
    if (TOPUP_FORBIDDEN_CLASSES.has(input.resourceClass) || !TOPUP_ALLOWED_CLASSES.has(input.resourceClass)) {
      throw new KernelError("TOPUP_FORBIDDEN", `resource class ${input.resourceClass} cannot be topped up`, {});
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new KernelError("INVALID_SCHEMA", "top-up amount must be a positive integer", { amount: input.amount });
    }
    this.roles.role(input.requestedByRole.roleId); // unknown requester fails closed
    const { request } = this.openApprovalRequest(state, { ...input, artifactSubjects: [] }, "BUDGET_TOPUP", state.stage, {
      actionClass: "BUDGET",
      budgetTopUp: { resourceClass: input.resourceClass, amount: input.amount },
    });
    unwrap(this.storage.createApprovalRequest(request));
    this.noteApprovalRequested(input.missionId, request);
    return request;
  }

  applyBudgetTopUp(input: { missionId: string; resourceClass: ResourceClass; amount: number; approvalRecordId: string }): BudgetLedger {
    if (TOPUP_FORBIDDEN_CLASSES.has(input.resourceClass)) {
      throw new KernelError("TOPUP_FORBIDDEN", `resource class ${input.resourceClass} cannot be topped up`, {});
    }
    if (!TOPUP_ALLOWED_CLASSES.has(input.resourceClass)) {
      throw new KernelError("TOPUP_FORBIDDEN", `unknown resource class ${input.resourceClass}`, {});
    }
    const record = unwrap(this.storage.getApprovalRecord(input.approvalRecordId));
    if (record === undefined || record.decision !== "APPROVED") {
      throw new KernelError("UNAUTHORIZED", "budget top-up requires an APPROVED ApprovalRecord", {});
    }
    const request = unwrap(this.storage.getApprovalRequest(record.approvalRequestId));
    if (request === undefined || request.approvalPurpose !== "BUDGET_TOPUP" || request.missionId !== input.missionId) {
      throw new KernelError("INVALID_PURPOSE", "top-up approval purpose/mission mismatch", {});
    }
    // The approval authorizes exactly the terms the human was shown. Without
    // this check one approval moved any amount on any allowed class.
    const terms = request.budgetTopUp;
    if (terms === undefined || terms.resourceClass !== input.resourceClass || terms.amount !== input.amount) {
      throw new KernelError("INVALID_PURPOSE", `approval ${record.approvalRecordId} does not authorize this top-up`, {
        approved: terms ?? null,
        requested: { resourceClass: input.resourceClass, amount: input.amount },
      });
    }
    // A05 / N1 req 8: the record must still describe the live request, and the
    // approval must be live at the moment of consumption.
    const liveHash = approvalSubjectHash(request);
    if (liveHash !== record.approvalSubjectHash) {
      throw new KernelError("STALE_APPROVAL", `approval ${record.approvalRecordId} subject changed since the record was built`, {
        approvalRecordId: record.approvalRecordId,
        recordedHash: record.approvalSubjectHash,
        currentHash: liveHash,
      });
    }
    if (isExpiredAtCommit(request, this.clock.now())) {
      throw new KernelError("EXPIRED_AT_COMMIT", `approval ${record.approvalRecordId} expired at commit`, {
        approvalRecordId: record.approvalRecordId,
        expiresAt: request.expiresAt,
      });
    }
    const ledger = this.ledger(input.missionId, input.resourceClass);
    const next = applyTopUp(ledger, {
      topUpId: this.ids.nextId("topup"),
      amount: input.amount,
      approvalRecordId: record.approvalRecordId,
      approvalSubjectHash: record.approvalSubjectHash,
      appliedAt: this.now(),
    });
    this.commit(input.missionId, (s) => ({
      events: [
        this.envelope(ET.BUDGET_TOPUP_APPROVED, s, this.actorFor(null, "CAPTAIN_TRANSPORT", "captain-transport"), { resourceClass: input.resourceClass, amount: input.amount }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `budget:${input.missionId}:${input.resourceClass}:topup:v${s.stateVersion}`,
        }),
      ],
      // N4 req 3: consume and move the limit inside the event's transaction.
      // Consuming first keeps the at-most-once guard ahead of the ledger write;
      // consuming inside the transaction means a refused transition consumes
      // nothing, so the approval stays usable and the limit does not move.
      effects: () => {
        unwrap(this.storage.consumeApproval(record.approvalRecordId, `topup:${input.resourceClass}`, this.now()));
        unwrap(this.storage.upsertLedger(input.missionId, input.resourceClass, ledger.ledgerVersion, next));
      },
    }));
    return next;
  }

  /** Forbidden limit mutation attempt → INTEGRITY_FAILURE + durable event (N4 req 2). */
  attemptLimitMutation(missionId: string, resourceClass: ResourceClass, newLimit: number): never {
    // Precondition: the ledger must exist; the limit itself stays immutable.
    this.ledger(missionId, resourceClass);
    unwrap(this.storage.recordRejection({
      missionId,
      scope: "budget",
      code: "INTEGRITY_FAILURE",
      detail: { attemptedLimit: newLimit, resourceClass },
      occurredAt: this.now(),
    }));
    this.commit(missionId, (s) => ({
      events: [
        this.envelope(ET.BUDGET_RESERVED, s, this.actorFor(null, "KERNEL_POLICY", "kernel"), { resourceClass, integrityFailure: true, attemptedLimit: newLimit }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `budget:${missionId}:${resourceClass}:limit-mutation-attempt:v${s.stateVersion}`,
        }),
      ],
    }));
    throw new KernelError("INTEGRITY_FAILURE", "immutableLimit mutation is forbidden", { attemptedLimit: newLimit });
  }

  // ── revision path (N6) ─────────────────────────────────────────────────

  requestRevision(input: { missionId: string; sourceArtifactId: string; sourceArtifactHash: string; requestedByRole: string; issueCode: RevisionIssueCode; severity: "content" | "infrastructure"; evidence: readonly { artifactId: string; contentSha256: string }[]; requiredChange: string }): RevisionRequest {
    const state = this.current(input.missionId);
    const request: RevisionRequest = {
      schemaVersion: 1,
      revisionId: this.ids.nextId("revision"),
      missionId: input.missionId,
      sourceArtifactId: input.sourceArtifactId,
      sourceArtifactHash: input.sourceArtifactHash,
      requestedByRoleId: input.requestedByRole,
      issueCode: input.issueCode,
      severity: input.severity,
      evidence: [...input.evidence],
      requiredChange: input.requiredChange,
      acceptanceTestIds: [],
      createdAt: this.now(),
      expiresAt: new Date(this.clock.now().getTime() + 3_600_000).toISOString(),
    };
    const envelope = this.envelope(
      ET.REVISION_REQUESTED,
      state,
      this.actorFor(input.requestedByRole, "ADMITTED_INVOCATION", input.requestedByRole),
      { revisionId: request.revisionId, issueCode: request.issueCode, dedupeKey: revisionDedupeKey({ issueCode: request.issueCode, sourceArtifactHash: request.sourceArtifactHash, requestedByRoleId: request.requestedByRoleId }) },
      { correlationId: this.ids.nextId("corr"), idempotencyKey: `revision:${request.revisionId}:requested` },
    );
    const committed = this.storage.atomicApply(input.missionId, [envelope], state.stateVersion, applyEvent);
    if (!committed.ok) throw committed.error;
    this.noteTransition(input.missionId, committed.value.state, committed.value.appended);
    return request;
  }

  completeRevision(missionId: string, newEvidence: string): MissionState {
    return this.stage(missionId, ET.REVISION_COMPLETED, "first-mate", { newEvidence }, `mission:${missionId}:revision-complete:${sha256Hex(newEvidence)}`);
  }

  // ── human review pause/resume ──────────────────────────────────────────

  escalateToHumanReview(missionId: string, incident: Record<string, unknown>): MissionState {
    return this.commit(missionId, (state) => ({
      events: [
        this.envelope(ET.RECOVERY_STARTED, state, this.actorFor(null, "KERNEL_POLICY", "kernel"), { incident }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `mission:${missionId}:incident:${state.stateVersion}`,
        }),
      ],
    }));
  }

  resumeFromHumanReview(missionId: string, decidedBy: string, newEvidence: string): MissionState {
    if (!isHumanAuthority(decidedBy, this.roles.roleIds(), HUMAN_AUTHORITY)) {
      throw new KernelError("SELF_APPROVAL_DENIED", "resume requires a human authority", {});
    }
    return this.commit(missionId, (state) => ({
      events: [
        this.envelope(ET.RECOVERY_COMPLETED, state, this.actorFor(null, "CAPTAIN_TRANSPORT", decidedBy), { newEvidence, decidedBy }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `mission:${missionId}:resume:${state.stateVersion}`,
        }),
      ],
    }));
  }

  // ── quality stages ─────────────────────────────────────────────────────

  completeImplementation(missionId: string): MissionState {
    return this.stage(missionId, ET.IMPLEMENTATION_COMPLETED, "craftsman", {}, `mission:${missionId}:impl-complete`, "produce_implementation_artifact");
  }

  completeVerification(missionId: string): MissionState {
    return this.stage(missionId, ET.VERIFICATION_COMPLETED, "verifier", {}, `mission:${missionId}:verif-complete`, "produce_verification_artifact");
  }

  completeTechnicalReview(missionId: string): MissionState {
    return this.stage(missionId, ET.TECHNICAL_REVIEW_COMPLETED, "reviewer", {}, `mission:${missionId}:review-complete`, "produce_review_artifact");
  }

  completeDocumentation(missionId: string): MissionState {
    return this.stage(missionId, ET.DOCUMENTATION_COMPLETED, "first-mate", {}, `mission:${missionId}:docs-complete`, "produce_documentation");
  }

  completeFinalPolicyGate(missionId: string, verdict: "allowed" | "rejected" | "unenforceable"): MissionState {
    return this.stage(missionId, ET.FINAL_GATE_COMPLETED, "first-mate", { verdict }, `mission:${missionId}:final-gate:${verdict}`, "screen_policy");
  }

  requestPackageApproval(input: { missionId: string; artifactSubjects: readonly ArtifactSubjectRef[]; requestedByRole: { roleId: string; roleVersion: number }; ttlMs: number }): ApprovalRequest {
    const state = this.current(input.missionId);
    if (state.stage !== "AWAITING_PUBLISH_APPROVAL") {
      throw new KernelError("ILLEGAL_TRANSITION", `package approval originates from AWAITING_PUBLISH_APPROVAL, not ${state.stage}`, {});
    }
    this.assertApprovalSubjects(state, input.artifactSubjects, [
      { hash: state.boundCandidateSha256, artifactType: "implementation_candidate", label: "the bound candidate" },
      { hash: state.boundVerificationSha256, artifactType: "verification_report", label: "the bound verification" },
    ]);
    const { request, envelope } = this.openApprovalRequest(state, input, "PACKAGE_APPROVAL", "READY_TO_PUBLISH");
    const committed = this.storage.atomicApply(input.missionId, [envelope], state.stateVersion, applyEvent, () => {
      // Same effect as the plan gate: the request row is part of the commit.
      unwrap(this.storage.createApprovalRequest(request));
    });
    if (!committed.ok) throw committed.error;
    this.noteApprovalRequested(input.missionId, request);
    return request;
  }

  /** E30: local close from READY_TO_PUBLISH — no public action (A33). */
  closeMission(missionId: string): MissionState {
    return this.commit(missionId, (state) => ({
      events: [
        this.envelope(ET.MISSION_CLOSED, state, this.actorFor(null, "CAPTAIN_TRANSPORT", "captain-transport"), { localClose: true }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `mission:${missionId}:close:${state.stateVersion}`,
        }),
      ],
    }));
  }

  // ── fake-runtime invocation seam ───────────────────────────────────────

  invokeAgent(request: Omit<AgentInvocation, "attempt" | "maximumAttempts"> & { attempt?: number }): AgentInvocationRecord {
    const invocation: AgentInvocation = {
      ...request,
      attempt: request.attempt ?? 1,
      maximumAttempts: 3,
    };
    this.roles.assertCapability(invocation.roleId, invocation.capabilityId as CapabilityId);
    const result = this.runtime.invoke(invocation);
    if (!result.ok) throw result.error;
    return result.value;
  }

  // ── queries ────────────────────────────────────────────────────────────

  getMission(missionId: string): MissionState | undefined {
    return unwrap(this.storage.getMissionState(missionId));
  }

  getEvents(missionId: string): readonly EventEnvelope[] {
    return unwrap(this.storage.listEvents(missionId));
  }

  getLedgerView(missionId: string, resourceClass: ResourceClass): ReturnType<typeof ledgerView> {
    return ledgerView(this.ledger(missionId, resourceClass));
  }

  /** Recovery: replay reconstructs identical state (A24). */
  replay(missionId: string): MissionState {
    const events = this.getEvents(missionId);
    const seed = initialMissionState({ missionId, title: this.getMission(missionId)?.title ?? "", createdAt: events[0]?.occurredAt ?? this.now() });
    return reduceAll(seed, events);
  }

  eventLogHash(missionId: string): string {
    const events = this.getEvents(missionId);
    const canonical = events
      .map((e) => `${e.missionSequence}|${e.eventType}|${e.eventId}|${e.payloadSha256}`)
      .join("\n");
    return sha256Hex(canonical);
  }
}

function attemptLedger<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: KernelError } {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (e instanceof KernelError) return { ok: false, error: e };
    throw e;
  }
}

export type { ApprovalPurpose };
