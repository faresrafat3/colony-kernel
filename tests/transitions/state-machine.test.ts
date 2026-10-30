/** A. State machine: legal/illegal transitions, terminal immutability, bounded cycles. */
import { describe, expect, it } from "vitest";
import { buildTestKernel, toPlanGate, toImplementation, toPackageGate } from "../../src/testing/builders/test-kernel.js";
import { renderTransitionTable, renderMermaidStateDiagram, EDGES } from "../../src/domain/mission/state-machine.js";
import { ALL_STAGES, TERMINAL_STAGES, PAUSE_STAGES, RESERVED_PUBLIC_STAGES, COUNTER_LIMITS, MissionStage as S } from "../../src/domain/mission/stages.js";
import { ALL_EVENT_TYPES, EVENT_TYPE_COUNT } from "../../src/domain/events/vocabulary.js";
import { applyEvent, canonicalPayloadHash } from "../../src/domain/events/apply-event.js";
import type { EventEnvelope } from "../../src/domain/events/envelope.js";
type import_type_Envelope = EventEnvelope;
import { FIXED_INSTANT } from "../../src/testing/builders/test-kernel.js";

describe("A. state machine", () => {
  it("A-01: legal happy path transitions succeed and increment stateVersion exactly once per event", () => {
    const k = buildTestKernel();
    const before = k.kernel.getMission(toPlanGate(k).missionId);
    expect(before?.stage).toBe("AWAITING_PLAN_APPROVAL");
  });

  it("A-02: illegal transition (RECON_COMPLETED from CREATED) fails without state change and records durable rejection", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const v0 = k.kernel.getMission(missionId)?.stateVersion;
    expect(() => k.kernel.completeRecon(missionId, "a-1")).toThrow(/ILLEGAL_TRANSITION/);
    expect(k.kernel.getMission(missionId)?.stateVersion).toBe(v0);
    expect(k.storage.listRejections().ok && k.storage.listRejections().value.some((r) => r.code === "ILLEGAL_TRANSITION")).toBe(true);
  });

  it("A-03: terminal states reject every transition", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    k.kernel.abortMission(missionId, "test abort");
    expect(k.kernel.getMission(missionId)?.stage).toBe("ABORTED");
    const v = k.kernel.getMission(missionId)?.stateVersion;
    expect(() => k.kernel.startMission(missionId)).toThrow(/terminal stage ABORTED/);
    expect(() => k.kernel.failMission(missionId, "late")).toThrow(/terminal stage ABORTED/);
    expect(k.kernel.getMission(missionId)?.stateVersion).toBe(v);
  });

  it("A-04: every accepted transition is one event with version+1 (no double counting)", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const v0 = k.kernel.getMission(missionId)?.stateVersion ?? -1;
    k.kernel.startMission(missionId);
    const state = k.kernel.getMission(missionId);
    expect(state?.stateVersion).toBe(v0 + 1);
    expect(state?.missionSequence).toBe(2);
  });

  it("A-05: unreachable transition rejection — POLICY_REJECTED cannot re-enter workflow", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    k.kernel.startMission(missionId);
    k.kernel.completePolicyScreen(missionId, "rejected");
    expect(k.kernel.getMission(missionId)?.stage).toBe("POLICY_REJECTED");
    expect(() => k.kernel.startMission(missionId)).toThrow(/ILLEGAL_TRANSITION/);
  });

  it("A-06: bounded plan-rework cycle exhausts at 2 and blocks the third", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const planSubjects = [{ artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planSha, finalizedAt: FIXED_INSTANT.toISOString() }];
    // E08 moved PLANNING -> AWAITING_PLAN_APPROVAL; return via rejected+request-change (E11).
    // The mission is AT the gate. Legal cycle per round: E11 (reject with
    // change, consumes gateReissueCount) → PLANNING → E07 propose → CHALLENGE
    // → E09 revise (consumes planReworkCount) → PLANNING → E07 → CHALLENGE →
    // E08 → AWAITING_PLAN_APPROVAL …
    for (let i = 0; i < 2; i++) {
      const r = k.kernel.requestPlanApproval({ missionId, artifactSubjects: planSubjects, requestedByRole: { roleId: "first-mate", roleVersion: 1 }, ttlMs: 60_000 });
      k.kernel.recordApprovalDecision({ approvalRequestId: r.approvalRequestId, decision: "REJECTED", decidedBy: "captain", requestedChange: true }); // E11 -> PLANNING
      expect(k.kernel.getMission(missionId)?.stage).toBe("PLANNING");
      k.kernel.proposePlan(missionId, planSha); // E07 PLANNING->CHALLENGE
      k.kernel.revisePlan(missionId, planSha, `new evidence ${i}`); // E09 CHALLENGE->PLANNING (consumes planReworkCount)
      k.kernel.proposePlan(missionId, planSha); // E07 PLANNING->CHALLENGE
      k.kernel.challengePlan(missionId, `challenge-${i}`); // E08 CHALLENGE->gate
    }
    const counters = k.kernel.getMission(missionId)?.counters;
    expect(counters?.planReworkCount).toBe(COUNTER_LIMITS.planReworkCount);
    expect(counters?.gateReissueCount).toBe(COUNTER_LIMITS.gateReissueCount);
    // Third gate-reissue must fail closed at the counter guard (mission is at
    // the gate after round 1's E08).
    const r3 = k.kernel.requestPlanApproval({ missionId, artifactSubjects: planSubjects, requestedByRole: { roleId: "first-mate", roleVersion: 1 }, ttlMs: 60_000 });
    expect(() =>
      k.kernel.recordApprovalDecision({ approvalRequestId: r3.approvalRequestId, decision: "REJECTED", decidedBy: "captain", requestedChange: true }),
    ).toThrow(/REVISION_LIMIT_EXCEEDED/);
    expect(k.kernel.getMission(missionId)?.stage).toBe("AWAITING_PLAN_APPROVAL");
  });

  it("A-07: pause state HUMAN_REVIEW_REQUIRED permits only abort/fail/recovery", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    k.kernel.startMission(missionId);
    k.kernel.completePolicyScreen(missionId, "unenforceable");
    expect(k.kernel.getMission(missionId)?.stage).toBe("HUMAN_REVIEW_REQUIRED");
    const v = k.kernel.getMission(missionId)?.stateVersion;
    expect(() => k.kernel.startRecon(missionId, "b")).toThrow(/pause stage/);
    expect(k.kernel.getMission(missionId)?.stateVersion).toBe(v);
  });

  it("A-08: reserved public states are unreachable (PUBLICATION_DISABLED on public-action events)", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = k.kernel.requestPlanApproval({ missionId, artifactSubjects: [{ artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planSha, finalizedAt: FIXED_INSTANT.toISOString() }], requestedByRole: { roleId: "first-mate", roleVersion: 1 }, ttlMs: 60_000 });
    k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" });
    const v = k.kernel.getMission(missionId)?.stateVersion;
    const { buildEnvelopeWithPayload } = publicActionProbe();
    const state = k.kernel.getMission(missionId);
    if (state === undefined) throw new Error("mission missing");
    const envelope = buildEnvelopeWithPayload(state, "PUBLIC_ACTION_PREPARED");
    const applied = k.storage.atomicApply(missionId, [envelope], state.stateVersion, applyEvent);
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.error.code).toBe("PUBLICATION_DISABLED");
    }
    // Rolled back fully: no event, no state change.
    expect(k.kernel.getMission(missionId)?.stateVersion).toBe(v);
    expect(k.kernel.getEvents(missionId).some((e) => e.eventId === "probe-public-1")).toBe(false);
    expect(RESERVED_PUBLIC_STAGES.has(S.PUBLISHED)).toBe(true);
  });

  it("A-09: generated table and Mermaid diagram derive from the single edge source", () => {
    const table = renderTransitionTable();
    const mermaid = renderMermaidStateDiagram();
    expect(table).toContain("E10");
    expect(mermaid).toContain("AWAITING_PLAN_APPROVAL --> IMPLEMENTATION: E10");
    expect(EDGES.length).toBeGreaterThan(20);
  });

  it("A-11: an infrastructure revision charges its own counter, not the content budget", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    k.kernel.finalizeArtifact({ missionId, roleId: "verifier", artifactType: "verification_report", content: { fields: { result: "pass" } }, slot: "verification" });
    k.kernel.completeImplementation(missionId);
    k.kernel.completeVerification(missionId);
    expect(k.kernel.getMission(missionId)?.stage).toBe("TECHNICAL_REVIEW");
    const ask = (severity: "content" | "infrastructure") =>
      k.kernel.requestRevision({
        missionId,
        sourceArtifactId: "art-1",
        sourceArtifactHash: `hash-${severity}`,
        requestedByRole: "verifier",
        issueCode: severity === "infrastructure" ? "VERIFICATION_INFRASTRUCTURE_FAILURE" : "VERIFICATION_CONTENT_FAILURE",
        severity,
        evidence: [],
        requiredChange: "rerun",
      });
    ask("infrastructure");
    k.kernel.completeRevision(missionId, "reran the runner");
    let counters = k.kernel.getMission(missionId)?.counters;
    expect(counters?.verificationInfraRetryCount).toBe(1);
    expect(counters?.revisionCount).toBe(0);
    ask("content");
    k.kernel.completeRevision(missionId, "changed the artifact");
    counters = k.kernel.getMission(missionId)?.counters;
    expect(counters?.verificationInfraRetryCount).toBe(1);
    expect(counters?.revisionCount).toBe(1);
  });

  it("A-12: READY_TO_PUBLISH is entered only through the approval edge, so its local close needs no second approval", () => {
    // The invariant that makes E30 safe: no path into the state skips the
    // consumed package grant, so closing needs nothing more.
    const entries = EDGES.filter((e) => e.to === S.READY_TO_PUBLISH);
    expect(entries.map((e) => e.id)).toEqual(["E26"]);
    expect(entries.every((e) => e.requiresApproval)).toBe(true);
    expect(EDGES.find((e) => e.id === "E30")?.requiresApproval).toBe(false);
  });

  it("A-13: an identical revision request is refused while the first is open (N6 dedupe)", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    k.kernel.finalizeArtifact({ missionId, roleId: "verifier", artifactType: "verification_report", content: { fields: { result: "fail" } }, slot: "verification" });
    k.kernel.completeImplementation(missionId);
    k.kernel.completeVerification(missionId);
    const ask = () =>
      k.kernel.requestRevision({
        missionId,
        sourceArtifactId: "art-1",
        sourceArtifactHash: "h-1",
        requestedByRole: "verifier",
        issueCode: "VERIFICATION_CONTENT_FAILURE",
        severity: "content",
        evidence: [],
        requiredChange: "fix it",
      });
    const first = ask();
    expect(k.kernel.getMission(missionId)?.stage).toBe("REVISION");
    // The same tuple again is a replay, not new work: refused durably, and the
    // mission pauses for a human instead of queueing a duplicate.
    expect(() => ask()).toThrow(/IDEMPOTENCY_CONFLICT/);
    expect(k.kernel.getMission(missionId)?.stage).toBe("HUMAN_REVIEW_REQUIRED");
    const requests = k.kernel.getEvents(missionId).filter((e) => e.eventType === "REVISION_REQUESTED");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.payload["revisionId"]).toBe(first.revisionId);
    expect(k.storage.listRejections().value?.at(-1)?.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("A-14: a revision survives an incident pause and still returns to its own stage", () => {
    // resumeStage belongs to pauses; the revision return target is a separate
    // fact. Sharing one field left REVISION unable to complete after an incident.
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    k.kernel.finalizeArtifact({ missionId, roleId: "verifier", artifactType: "verification_report", content: { fields: { result: "fail" } }, slot: "verification" });
    k.kernel.completeImplementation(missionId);
    k.kernel.completeVerification(missionId);
    k.kernel.requestRevision({
      missionId,
      sourceArtifactId: "art-1",
      sourceArtifactHash: "h-2",
      requestedByRole: "verifier",
      issueCode: "VERIFICATION_CONTENT_FAILURE",
      severity: "content",
      evidence: [],
      requiredChange: "fix it",
    });
    expect(k.kernel.getMission(missionId)?.revisionReturnStage).toBe("TECHNICAL_REVIEW");
    k.kernel.escalateToHumanReview(missionId, { reason: "blocked" });
    expect(k.kernel.getMission(missionId)?.stage).toBe("HUMAN_REVIEW_REQUIRED");
    k.kernel.resumeFromHumanReview(missionId, "captain", "reviewed");
    const back = k.kernel.getMission(missionId);
    expect(back?.stage).toBe("REVISION");
    expect(back?.revisionReturnStage).toBe("TECHNICAL_REVIEW");
    expect(k.kernel.completeRevision(missionId, "fixed and re-verified").stage).toBe("TECHNICAL_REVIEW");
    expect(k.kernel.getMission(missionId)?.counters.revisionCount).toBe(1);
  });

  it("A-15: every stage that can open a revision can also finish it", () => {
    // The class of bug worth pinning: an entry edge with no matching exit left
    // the mission stuck in REVISION for good. Five stages can open one.
    const open = (k: ReturnType<typeof buildTestKernel>, missionId: string, hash: string) =>
      k.kernel.requestRevision({
        missionId,
        sourceArtifactId: "src",
        sourceArtifactHash: hash,
        requestedByRole: "verifier",
        issueCode: "VERIFICATION_CONTENT_FAILURE",
        severity: "content",
        evidence: [],
        requiredChange: "rework",
      });

    // IMPLEMENTATION
    {
      const k = buildTestKernel();
      const { missionId } = toImplementation(k);
      open(k, missionId, "from-implementation");
      expect(k.kernel.completeRevision(missionId, "impl evidence").stage).toBe("IMPLEMENTATION");
    }
    // VERIFICATION
    {
      const k = buildTestKernel();
      const { missionId } = toImplementation(k);
      k.kernel.completeImplementation(missionId);
      open(k, missionId, "from-verification");
      expect(k.kernel.completeRevision(missionId, "verify evidence").stage).toBe("VERIFICATION");
    }
    // TECHNICAL_REVIEW
    {
      const k = buildTestKernel();
      const { missionId } = toImplementation(k);
      k.kernel.completeImplementation(missionId);
      k.kernel.completeVerification(missionId);
      open(k, missionId, "from-review");
      expect(k.kernel.completeRevision(missionId, "review evidence").stage).toBe("TECHNICAL_REVIEW");
    }
    // DOCUMENTATION — a documentation byte change re-enters verification
    {
      const k = buildTestKernel();
      const { missionId } = toImplementation(k);
      k.kernel.finalizeArtifact({ missionId, roleId: "verifier", artifactType: "verification_report", content: { fields: { result: "pass" } }, slot: "verification" });
      k.kernel.completeImplementation(missionId);
      k.kernel.completeVerification(missionId);
      k.kernel.finalizeArtifact({ missionId, roleId: "reviewer", artifactType: "technical_review", content: { fields: { verdict: "ok" } } });
      k.kernel.completeTechnicalReview(missionId);
      expect(k.kernel.getMission(missionId)?.stage).toBe("DOCUMENTATION");
      open(k, missionId, "from-documentation");
      expect(k.kernel.completeRevision(missionId, "docs evidence").stage).toBe("VERIFICATION");
    }
    // AWAITING_PUBLISH_APPROVAL — package rejection that asks for a change (E28)
    {
      const k = buildTestKernel();
      const { missionId, request } = toPackageGate(k);
      k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "REJECTED", decidedBy: "captain", requestedChange: true });
      expect(k.kernel.getMission(missionId)?.stage).toBe("REVISION");
      expect(k.kernel.completeRevision(missionId, "package evidence").stage).toBe("AWAITING_PUBLISH_APPROVAL");
    }
  });

  it("A-16: a revision cannot be opened from a stage whose contract does not name it", () => {
    // FINAL_POLICY_GATE's only exits are the three verdict transitions; the old
    // blanket common row let it open a revision it had no exit from.
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    k.kernel.finalizeArtifact({ missionId, roleId: "verifier", artifactType: "verification_report", content: { fields: { result: "pass" } }, slot: "verification" });
    k.kernel.completeImplementation(missionId);
    k.kernel.completeVerification(missionId);
    k.kernel.finalizeArtifact({ missionId, roleId: "reviewer", artifactType: "technical_review", content: { fields: { verdict: "ok" } } });
    k.kernel.completeTechnicalReview(missionId);
    k.kernel.finalizeArtifact({ missionId, roleId: "first-mate", artifactType: "documentation_bundle", content: { fields: { changelog: "x" } } });
    k.kernel.completeDocumentation(missionId);
    expect(k.kernel.getMission(missionId)?.stage).toBe("FINAL_POLICY_GATE");
    const v = k.kernel.getMission(missionId)?.stateVersion;
    expect(() =>
      k.kernel.requestRevision({
        missionId,
        sourceArtifactId: "src",
        sourceArtifactHash: "h",
        requestedByRole: "verifier",
        issueCode: "VERIFICATION_CONTENT_FAILURE",
        severity: "content",
        evidence: [],
        requiredChange: "x",
      }),
    ).toThrow(/ILLEGAL_TRANSITION/);
    expect(k.kernel.getMission(missionId)?.stateVersion).toBe(v);
  });

  it("A-10: 22 canonical stages, 40 event types, 5 terminal, 2 pause", () => {
    expect(ALL_STAGES.length).toBe(22);
    expect(EVENT_TYPE_COUNT).toBe(40);
    expect(TERMINAL_STAGES.size).toBe(5);
    expect(PAUSE_STAGES.size).toBe(2);
    expect(ALL_EVENT_TYPES.length).toBe(40);
  });
});

type Envelope = import_type_Envelope;
function publicActionProbe(): { buildEnvelopeWithPayload: (state: { missionId: string; missionSequence: number; stateVersion: number }, eventType: string) => Envelope } {
  return {
    buildEnvelopeWithPayload: (state, eventType) => ({
      schemaVersion: 1,
      eventId: "probe-public-1",
      eventType: eventType as never,
      missionId: state.missionId,
      missionSequence: state.missionSequence + 1,
      expectedStateVersion: state.stateVersion,
      actor: { actorType: "ADMITTED_INVOCATION", actorId: "probe", roleId: "craftsman", roleVersion: 1 },
      causationId: null,
      correlationId: "probe",
      idempotencyKey: "probe:public-action",
      occurredAt: FIXED_INSTANT.toISOString(),
      recordedAt: FIXED_INSTANT.toISOString(),
      payload: { target: "github" },
      payloadSha256: canonicalPayloadHash({ target: "github" }),
    }),
  };
}
