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
import { testRoleRegistry } from "../domain/capabilities/registry.js";
import type { CapabilityId } from "../domain/capabilities/registry.js";
import type { ArtifactContent, ArtifactType, ArtifactManifest } from "../domain/artifacts/artifact.js";
import { canonicalArtifactContent } from "../domain/artifacts/artifact.js";
import { sha256Hex } from "../domain/support/sha256.js";
import type {
  ApprovalRequest,
  ApprovalRecord,
  ApprovalPurpose,
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

const AGENT_ROLE_IDS = ["first-mate", "craftsman", "verifier", "reviewer"];
const HUMAN_AUTHORITY = "captain";

export class ColonyKernel {
  readonly storage: ColonyStorage;
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

  /** Commit an event batch atomically; telemetry + durable rejection on failure. */
  private commit(
    missionId: string,
    build: (state: MissionState) => { events: EventEnvelope[]; reduce?: typeof applyEvent },
  ): MissionState {
    const pre = this.current(missionId);
    const { events, reduce } = build(pre);
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
    const result = this.storage.atomicApply(missionId, events, pre.stateVersion, reduce ?? applyEvent);
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
    this.telemetry.record({
      kind: "transition",
      missionId,
      code: state.stage,
      detail: { stateVersion: state.stateVersion, events: result.value.appended },
    });
    return state;
  }

  // ── commands: lifecycle ────────────────────────────────────────────────

  createMission(input: { title: string; correlationId?: string }): { missionId: string; state: MissionState } {
    const missionId = this.ids.nextId("mission");
    const state0 = initialMissionState({ missionId, title: input.title, createdAt: this.now() });
    const created = initialMissionState({ missionId, title: input.title, createdAt: state0.createdAt });
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
    void created;
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

  requestPlanApproval(input: { missionId: string; artifactSubjects: readonly ArtifactSubjectRef[]; requestedByRole: { roleId: string; roleVersion: number }; ttlMs: number }): ApprovalRequest {
    const state = this.current(input.missionId);
    if (state.stage !== "AWAITING_PLAN_APPROVAL") {
      throw new KernelError("ILLEGAL_TRANSITION", `approval requests originate from AWAITING_PLAN_APPROVAL, not ${state.stage}`, {});
    }
    const request: ApprovalRequest = {
      schemaVersion: 1,
      approvalRequestId: this.ids.nextUuid(),
      missionId: state.missionId,
      missionStateVersion: state.stateVersion,
      requestedTransition: { fromState: state.stage, toState: "IMPLEMENTATION" },
      approvalPurpose: "PLAN_APPROVAL",
      actionClass: "LOCAL_WRITE",
      requestedByRole: input.requestedByRole,
      requiredHumanAuthority: HUMAN_AUTHORITY,
      artifactSubjects: sortArtifactSubjects(input.artifactSubjects),
      policyVersion: "v0.1.1",
      roleVersions: { "first-mate": 1, craftsman: 1, verifier: 1, reviewer: 1 },
      issuedAt: this.now(),
      expiresAt: new Date(this.clock.now().getTime() + input.ttlMs).toISOString(),
      nonce: this.ids.nextNonce(),
    };
    const subjectHash = approvalSubjectHash(request);
    const envelope = this.envelope(
      ET.APPROVAL_REQUESTED,
      state,
      this.actorFor(input.requestedByRole.roleId, "ADMITTED_INVOCATION", input.requestedByRole.roleId),
      { approvalRequestId: request.approvalRequestId, approvalSubjectHash: subjectHash, purpose: request.approvalPurpose },
      { correlationId: this.ids.nextId("corr"), idempotencyKey: `approval:${request.approvalRequestId}:requested` },
    );
    const committed = this.storage.atomicApply(input.missionId, [envelope], state.stateVersion, applyEvent);
    if (!committed.ok) throw committed.error;
    unwrap(this.storage.createApprovalRequest(request));
    this.telemetry.record({ kind: "approval", missionId: input.missionId, code: "APPROVAL_REQUESTED", detail: { subjectHash } });
    return request;
  }

  /** Captain decision (deterministic test authority in M1A). */
  recordApprovalDecision(input: { approvalRequestId: string; decision: "APPROVED" | "REJECTED"; decidedBy: string; reason?: string; requestedChange?: boolean }): ApprovalRecord {
    const request = unwrap(this.storage.getApprovalRequest(input.approvalRequestId));
    if (request === undefined) throw new KernelError("APPROVAL_NOT_FOUND", `approval ${input.approvalRequestId} not found`, {});
    if (!isHumanAuthority(input.decidedBy, AGENT_ROLE_IDS)) {
      throw new KernelError("SELF_APPROVAL_DENIED", `agent identity ${input.decidedBy} cannot approve`, { decidedBy: input.decidedBy });
    }
    // Idempotent replay: an identical decision already recorded returns the
    // original record without emitting a second transition event (N1).
    const existing = unwrap(this.storage.getApprovalRecordByRequest(input.approvalRequestId));
    if (existing !== undefined && existing.decision === input.decision) {
      return existing;
    }
    const record: ApprovalRecord = {
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
    unwrap(this.storage.recordApprovalDecision(record));
    const state = this.current(request.missionId);
    const envelope = this.envelope(
      ET.APPROVAL_RECORDED,
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
    try {
      // N1 req 6: an approved record past its expiresAt must not authorize the
      // transition — expiry is judged at commit time against the injected clock.
      if (record.decision === "APPROVED" && isExpiredAtCommit(request, this.clock.now())) {
        throw new KernelError("EXPIRED_AT_COMMIT", `approval ${request.approvalRequestId} expired at commit`, {
          approvalRequestId: request.approvalRequestId,
          expiresAt: request.expiresAt,
        });
      }
      applyEvent(state, envelope);
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
      }
      throw e;
    }
    const committed = this.storage.atomicApply(request.missionId, [envelope], state.stateVersion, (s, e) => {
      const next = applyEvent(s, e);
      if (record.decision === "APPROVED") {
        unwrap(this.storage.consumeApproval(record.approvalRecordId, `${s.stage}->${next.stage}`, this.now()));
      }
      return next;
    });
    if (!committed.ok) throw committed.error;
    this.telemetry.record({ kind: "approval", missionId: request.missionId, code: record.decision, detail: { subjectHash: record.approvalSubjectHash } });
    return record;
  }

  /** Record-level decision without a transition event (test/audit seam). */
  recordApprovalDecisionRaw(input: { approvalRequestId: string; decision: "APPROVED" | "REJECTED"; decidedBy: string; reason?: string }): ApprovalRecord {
    const request = unwrap(this.storage.getApprovalRequest(input.approvalRequestId));
    if (request === undefined) throw new KernelError("APPROVAL_NOT_FOUND", `approval ${input.approvalRequestId} not found`, {});
    const record: ApprovalRecord = {
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
    void this.current(input.missionId);
    const role = this.roles.role(input.roleId);
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
    const committed = this.commit(input.missionId, (s) => ({
      events: [
        this.envelope(ET.ARTIFACT_FINALIZED, s, this.actorFor(input.roleId, "ADMITTED_INVOCATION", input.roleId), payload, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `artifact:${artifactId}:finalized`,
        }),
      ],
    }));
    void committed;
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
    unwrap(this.storage.upsertLedger(missionId, resourceClass, ledger.ledgerVersion, next));
    this.commit(missionId, (s) => ({
      events: [
        this.envelope(ET.BUDGET_RESERVED, s, this.actorFor(null, "KERNEL_POLICY", "kernel"), { resourceClass, amount, reserved: next.reserved }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `budget:${missionId}:${resourceClass}:reserve:v${s.stateVersion}`,
        }),
      ],
    }));
    this.telemetry.record({ kind: "budget", missionId, code: "BUDGET_RESERVED", detail: { resourceClass, amount } });
    return next;
  }

  settleBudget(missionId: string, resourceClass: ResourceClass, amount: number): BudgetLedger {
    const ledger = this.ledger(missionId, resourceClass);
    const next = unwrap(attemptLedger(() => settle(ledger, "inv", amount)));
    unwrap(this.storage.upsertLedger(missionId, resourceClass, ledger.ledgerVersion, next));
    this.commit(missionId, (s) => ({
      events: [
        this.envelope(ET.BUDGET_SETTLED, s, this.actorFor(null, "KERNEL_POLICY", "kernel"), { resourceClass, amount, spent: next.spent }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `budget:${missionId}:${resourceClass}:settle:v${s.stateVersion}`,
        }),
      ],
    }));
    this.telemetry.record({ kind: "budget", missionId, code: "BUDGET_SETTLED", detail: { resourceClass, amount } });
    return next;
  }

  releaseBudget(missionId: string, resourceClass: ResourceClass, amount: number): BudgetLedger {
    const ledger = this.ledger(missionId, resourceClass);
    const next = unwrap(attemptLedger(() => release(ledger, amount)));
    unwrap(this.storage.upsertLedger(missionId, resourceClass, ledger.ledgerVersion, next));
    this.commit(missionId, (s) => ({
      events: [
        this.envelope(ET.BUDGET_RELEASED, s, this.actorFor(null, "KERNEL_POLICY", "kernel"), { resourceClass, amount }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `budget:${missionId}:${resourceClass}:release:v${s.stateVersion}`,
        }),
      ],
    }));
    return next;
  }

  /** Top-up requires a consumed BUDGET_TOPUP ApprovalRecord (N4 req 3, 11). */
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
    const ledger = this.ledger(input.missionId, input.resourceClass);
    const next = applyTopUp(ledger, {
      topUpId: this.ids.nextId("topup"),
      amount: input.amount,
      approvalRecordId: record.approvalRecordId,
      approvalSubjectHash: record.approvalSubjectHash,
      appliedAt: this.now(),
    });
    unwrap(this.storage.upsertLedger(input.missionId, input.resourceClass, ledger.ledgerVersion, next));
    this.commit(input.missionId, (s) => ({
      events: [
        this.envelope(ET.BUDGET_TOPUP_APPROVED, s, this.actorFor(null, "CAPTAIN_TRANSPORT", "captain-transport"), { resourceClass: input.resourceClass, amount: input.amount }, {
          correlationId: this.ids.nextId("corr"),
          idempotencyKey: `budget:${input.missionId}:${input.resourceClass}:topup:v${s.stateVersion}`,
        }),
      ],
    }));
    return next;
  }

  /** Forbidden limit mutation attempt → INTEGRITY_FAILURE + durable event (N4 req 2). */
  attemptLimitMutation(missionId: string, resourceClass: ResourceClass, newLimit: number): never {
    const ledger = this.ledger(missionId, resourceClass);
    void ledger;
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
    if (!isHumanAuthority(decidedBy, AGENT_ROLE_IDS)) {
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
    const request: ApprovalRequest = {
      schemaVersion: 1,
      approvalRequestId: this.ids.nextUuid(),
      missionId: state.missionId,
      missionStateVersion: state.stateVersion,
      requestedTransition: { fromState: state.stage, toState: "READY_TO_PUBLISH" },
      approvalPurpose: "PACKAGE_APPROVAL",
      actionClass: "LOCAL_WRITE",
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
    const committed = this.storage.atomicApply(input.missionId, [envelope], state.stateVersion, applyEvent);
    if (!committed.ok) throw committed.error;
    unwrap(this.storage.createApprovalRequest(request));
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
