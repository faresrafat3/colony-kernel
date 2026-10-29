/**
 * Regression tests for the adversarial-review approval-layer findings
 * (2026-10-12). Each pins one fix so the exact hole cannot reopen.
 *
 * - R1 (CRITICAL): recordApprovalDecision re-binds the subject hash at commit
 *   and refuses STALE_APPROVAL when the request changed after the record.
 * - R2: recordApprovalDecisionRaw carries the same authority guard — an agent
 *   identity cannot self-approve on any public path.
 * - R3: applyBudgetTopUp consumes the approval exactly once — the same APPROVED
 *   record cannot raise the limit repeatedly.
 *
 * Each finding was reproduced behaviourally before the fix and re-run after.
 */
import { describe, expect, it } from "vitest";
import { buildTestKernel, toPlanGate, toImplementation, FIXED_INSTANT, type TestKernel } from "../../src/testing/builders/test-kernel.js";
import { approvalSubjectHash } from "../../src/domain/approvals/approval.js";
import { DeterministicClock } from "../../src/adapters/kernel-adapters.js";
import { TamperingStorage } from "../support/tampering-storage.js";

/** File a BUDGET_TOPUP approval the way the real machinery does. */
function topUpApproval(k: TestKernel, missionId: string, decidedBy = "captain"): string {
  const request = {
    schemaVersion: 1 as const,
    approvalRequestId: k.kernel.ids.nextUuid(),
    missionId,
    missionStateVersion: k.kernel.getMission(missionId)?.stateVersion ?? 0,
    requestedTransition: { fromState: "IMPLEMENTATION", toState: "IMPLEMENTATION" },
    approvalPurpose: "BUDGET_TOPUP" as const,
    actionClass: "BUDGET" as const,
    budgetTopUp: { resourceClass: "monetary_cost" as const, amount: 400 },
    requestedByRole: { roleId: "first-mate", roleVersion: 1 },
    requiredHumanAuthority: "captain",
    artifactSubjects: [],
    policyVersion: "v0.1.1",
    roleVersions: {},
    issuedAt: FIXED_INSTANT.toISOString(),
    expiresAt: new Date(FIXED_INSTANT.getTime() + 60_000).toISOString(),
    nonce: k.kernel.ids.nextNonce(),
  };
  const record = {
    schemaVersion: 1 as const,
    approvalRecordId: k.kernel.ids.nextUuid(),
    approvalRequestId: request.approvalRequestId,
    approvalSubjectHash: approvalSubjectHash(request),
    decision: "APPROVED" as const,
    decidedBy,
    decidedAt: FIXED_INSTANT.toISOString(),
    authorityProof: { method: "deterministic-test-authority", reference: "captain-test-key" },
    optionalReason: null,
  };
  k.storage.createApprovalRequest(request);
  k.storage.recordApprovalDecision(record);
  return record.approvalRecordId;
}

describe("R. approval-layer review fixes", () => {
  it("R2: an agent identity cannot self-approve through the Raw seam", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = k.kernel.requestPlanApproval({
      missionId,
      artifactSubjects: [{ artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planSha, finalizedAt: FIXED_INSTANT.toISOString() }],
      requestedByRole: { roleId: "craftsman", roleVersion: 1 },
      ttlMs: 60_000,
    });
    expect(() =>
      k.kernel.recordApprovalDecisionRaw({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "craftsman" }),
    ).toThrow(/SELF_APPROVAL_DENIED/);
    // no APPROVED record was stored by the agent identity
    const stored = k.storage.getApprovalRecordByRequest(request.approvalRequestId);
    expect(stored.ok ? stored.value?.decision : undefined).not.toBe("APPROVED");
  });

  it("R3: one APPROVED top-up record is consumed once — reuse is refused", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    k.kernel.setBudgetLimit(missionId, "monetary_cost", 100);
    const rec = topUpApproval(k, missionId);
    k.kernel.applyBudgetTopUp({ missionId, resourceClass: "monetary_cost", amount: 400, approvalRecordId: rec });
    const after1 = k.kernel.getLedgerView(missionId, "monetary_cost").effectiveLimit;
    expect(after1).toBe(500);
    // the same record again must be refused — consumed at most once
    expect(() =>
      k.kernel.applyBudgetTopUp({ missionId, resourceClass: "monetary_cost", amount: 400, approvalRecordId: rec }),
    ).toThrow(/APPROVAL_ALREADY_CONSUMED/);
    // limit did not move a second time
    expect(k.kernel.getLedgerView(missionId, "monetary_cost").effectiveLimit).toBe(500);
  });

  it("R1: a request mutated after the record is refused with STALE_APPROVAL", () => {
    const clock = new DeterministicClock(FIXED_INSTANT);
    const storage = new TamperingStorage(clock);
    const k = buildTestKernel({ clock, storage });
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = k.kernel.requestPlanApproval({
      missionId,
      artifactSubjects: [{ artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planSha, finalizedAt: FIXED_INSTANT.toISOString() }],
      requestedByRole: { roleId: "craftsman", roleVersion: 1 },
      ttlMs: 60_000,
    });
    // build the record over the original subject...
    const record = {
      schemaVersion: 1 as const,
      approvalRecordId: k.kernel.ids.nextUuid(),
      approvalRequestId: request.approvalRequestId,
      approvalSubjectHash: approvalSubjectHash(request),
      decision: "APPROVED" as const,
      decidedBy: "captain",
      decidedAt: FIXED_INSTANT.toISOString(),
      authorityProof: { method: "deterministic-test-authority", reference: "captain-test-key" },
      optionalReason: null,
    };
    k.storage.recordApprovalDecision(record);
    // A conforming store forbids replacement; a non-conforming one can still
    // return a mutated read, and the hash check must refuse it.
    storage.tamper = (live) => ({ ...live, artifactSubjects: [{ ...live.artifactSubjects[0], contentSha256: "changed-bytes" }] });
    // the decision must be refused: the live subject no longer matches the record
    expect(() =>
      k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" }),
    ).toThrow(/STALE_APPROVAL/);
    // and the mission did not advance
    expect(k.kernel.getMission(missionId)?.stage).toBe("AWAITING_PLAN_APPROVAL");
  });

  it("R1b: an unmutated subject still commits (no false STALE)", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = k.kernel.requestPlanApproval({
      missionId,
      artifactSubjects: [{ artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planSha, finalizedAt: FIXED_INSTANT.toISOString() }],
      requestedByRole: { roleId: "craftsman", roleVersion: 1 },
      ttlMs: 60_000,
    });
    expect(() =>
      k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" }),
    ).not.toThrow();
    expect(k.kernel.getMission(missionId)?.stage).toBe("IMPLEMENTATION");
  });
});
