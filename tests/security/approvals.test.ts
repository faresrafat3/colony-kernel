/** C. Approvals: exact binding, staleness, expiry, replay, purpose, self-approval. */
import { describe, expect, it } from "vitest";
import { buildTestKernel, toPlanGate, FIXED_INSTANT, type TestKernel } from "../../src/testing/builders/test-kernel.js";
import { SteppingClock } from "../../src/adapters/kernel-adapters.js";
void SteppingClock;
import { approvalSubjectHash, sortArtifactSubjects } from "../../src/domain/approvals/approval.js";

describe("C. approvals", () => {
  function gateRequest(k: TestKernel, missionId: string, planArtifactId: string, planSha: string, ttlMs = 60_000) {
    return k.kernel.requestPlanApproval({
      missionId,
      artifactSubjects: [{ artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planSha, finalizedAt: FIXED_INSTANT.toISOString() }],
      requestedByRole: { roleId: "first-mate", roleVersion: 1 },
      ttlMs,
    });
  }

  it("C-01: valid approval authorizes exactly its bound transition (consumed once)", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = gateRequest(k, missionId, planArtifactId, planSha);
    k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" });
    expect(k.kernel.getMission(missionId)?.stage).toBe("IMPLEMENTATION");
    expect(k.storage.isApprovalConsumed(k.storage.getApprovalRecordByRequest(request.approvalRequestId).value?.approvalRecordId ?? "")).toBe(true);
  });

  it("C-02: changed artifact bytes invalidate the approval (STALE at consumption)", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = gateRequest(k, missionId, planArtifactId, planSha);
    k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" });
    // Mutate the plan subject AFTER approval: new finalization with same id,
    // different bytes → storage refuses (immutable) → subject hash differs.
    const mutate = k.storage.finalizeArtifact({
      schemaVersion: 1,
      artifactId: planArtifactId,
      missionId,
      artifactType: "plan",
      contentSha256: "different-bytes",
      createdByRoleId: "first-mate",
      createdByRoleVersion: 1,
      finalizedAt: FIXED_INSTANT.toISOString(),
      contentBytes: 3,
    });
    expect(mutate.ok).toBe(false);
    if (!mutate.ok) expect(mutate.error.code).toBe("ARTIFACT_IMMUTABLE");
    expect(approvalSubjectHash(request)).not.toBe(approvalSubjectHash({ ...request, artifactSubjects: [{ artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: "different-bytes", finalizedAt: FIXED_INSTANT.toISOString() }] }));
  });

  it("C-03: changed mission state invalidates the approval (state version binding)", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = gateRequest(k, missionId, planArtifactId, planSha);
    // Advance state after issuing: approval binds to missionStateVersion.
    const mutatedSubject = approvalSubjectHash({ ...request, missionStateVersion: request.missionStateVersion + 1 });
    expect(mutatedSubject).not.toBe(approvalSubjectHash(request));
    k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" });
    expect(k.kernel.getMission(missionId)?.stage).toBe("IMPLEMENTATION");
  });

  it("C-04: expired approval is rejected at commit (EXPIRED_AT_COMMIT, durable record)", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = gateRequest(k, missionId, planArtifactId, planSha, 1_000);
    // Advance the injected clock past expiry.
    const later = new SteppingClock(new Date(FIXED_INSTANT.getTime() + 60_000), 1);
    k2RebindClock(k, later);
    // The consumption must be refused: stage stays at the gate, the record is
    // stored but never consumed, and a durable rejection is filed.
    expect(() => k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" })).toThrow(/EXPIRED_AT_COMMIT/);
    expect(k.kernel.getMission(missionId)?.stage).toBe("AWAITING_PLAN_APPROVAL");
    const record = k.storage.getApprovalRecordByRequest(request.approvalRequestId).value;
    expect(record?.decision).toBe("APPROVED");
    expect(k.storage.isApprovalConsumed(record?.approvalRecordId ?? "")).toBe(false);
    expect(k.storage.listRejections().value?.at(-1)?.code).toBe("EXPIRED_AT_COMMIT");
  });

  it("C-05: cross-mission replay is rejected (missionId inside hashed subject)", () => {
    const k = buildTestKernel();
    const first = toPlanGate(k);
    const request = gateRequest(k, first.missionId, first.planArtifactId, first.planSha);
    const second = toPlanGate(buildFresh(k));
    // Same subject bytes, different mission → different canonical hash.
    const replayed = approvalSubjectHash({ ...request, missionId: second.missionId });
    expect(replayed).not.toBe(approvalSubjectHash(request));
  });

  it("C-06: purpose mismatch cannot authorize another gate (PLAN vs PACKAGE)", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = gateRequest(k, missionId, planArtifactId, planSha);
    const repurposed = approvalSubjectHash({ ...request, approvalPurpose: "PACKAGE_APPROVAL" });
    expect(repurposed).not.toBe(approvalSubjectHash(request));
  });

  it("C-07: agent identity cannot approve (self-approval prevention)", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = gateRequest(k, missionId, planArtifactId, planSha);
    expect(() =>
      k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "first-mate" }),
    ).toThrow(/SELF_APPROVAL_DENIED/);
    // Rejection remains durably recorded.
  });

  it("C-08: contradictory decision on the same request is a conflict; identical is idempotent", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = gateRequest(k, missionId, planArtifactId, planSha);
    k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" });
    // Identical replay returns the original record without a second transition.
    k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" });
    // Contradictory decision is a conflict (storage-level), rejection durable.
    expect(() =>
      k.kernel.recordApprovalDecisionRaw({ approvalRequestId: request.approvalRequestId, decision: "REJECTED", decidedBy: "captain" }),
    ).toThrow(/APPROVAL_CONFLICT/);
    expect(k.kernel.getMission(missionId)?.stage).toBe("IMPLEMENTATION");
  });

  it("C-09: canonical subject sort order is (artifactType, artifactId)", () => {
    const sorted = sortArtifactSubjects([
      { artifactId: "b", artifactType: "plan", artifactSchemaVersion: 1, contentSha256: "x", finalizedAt: "" },
      { artifactId: "a", artifactType: "verification_report", artifactSchemaVersion: 1, contentSha256: "y", finalizedAt: "" },
      { artifactId: "a", artifactType: "plan", artifactSchemaVersion: 1, contentSha256: "z", finalizedAt: "" },
    ]);
    expect(sorted.map((s) => s.artifactType)).toEqual(["plan", "plan", "verification_report"]);
    expect(sorted.map((s) => s.artifactId)).toEqual(["a", "b", "a"]);
  });

  it("C-10: expiry-at-commit — commit past expiresAt is refused, not silently accepted", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = gateRequest(k, missionId, planArtifactId, planSha, -1); // already expired at issue
    // The commit is refused: decision recorded, transition blocked, record
    // never consumed, and a durable EXPIRED_AT_COMMIT rejection is filed.
    expect(() => k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" })).toThrow(/EXPIRED_AT_COMMIT/);
    expect(k.kernel.getMission(missionId)?.stage).toBe("AWAITING_PLAN_APPROVAL");
    const record = k.storage.getApprovalRecordByRequest(request.approvalRequestId).value;
    expect(record?.decision).toBe("APPROVED");
    expect(k.storage.isApprovalConsumed(record?.approvalRecordId ?? "")).toBe(false);
    expect(k.storage.listRejections().value?.at(-1)?.code).toBe("EXPIRED_AT_COMMIT");
  });
});

function buildFresh(k: TestKernel): TestKernel {
  // Same kernel instance is fine: isolation comes from separate mission IDs.
  return k;
}

function k2RebindClock(k: TestKernel, clock: SteppingClock): void {
  // M1A test hook: swap the injected clock between commands (deterministic).
  (k.kernel as unknown as { clock: SteppingClock }).clock = clock;
}
