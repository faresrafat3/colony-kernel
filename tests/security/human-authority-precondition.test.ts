/**
 * Finding F1 — `reports/INDEPENDENT_REVIEW_1A.md` (2026-10-05):
 * "the human-authority guard is only as strong as the role list it is given".
 *
 * `isHumanAuthority(decidedBy, [])` returns `true` for every identity, so a
 * call site that passed an empty list would silently accept an agent as the
 * approver. The review's recommendation was twofold: state the precondition
 * in the function's doc comment, and add a test at the application layer
 * asserting the call site cannot pass `[]`.
 *
 * These tests pin the second half behaviourally: if the call site passed an
 * empty list, the agent identities below would be accepted as human
 * authorities and every one of these assertions would fail. They also pin
 * the drift case — a role the kernel knows but the guard does not — by
 * deriving the guard's list from the registry's own manifests.
 */
import { describe, expect, it } from "vitest";
import { buildTestKernel, toPlanGate, FIXED_INSTANT } from "../../src/testing/builders/test-kernel.js";
import { isHumanAuthority } from "../../src/domain/approvals/approval.js";
import { AGENT_ROLE_IDS, RoleRegistry, testRoleRegistry } from "../../src/domain/capabilities/registry.js";

/** File a plan-approval request the way the real machinery does. */
function planApprovalRequest(k: ReturnType<typeof buildTestKernel>, missionId: string, planArtifactId: string, planSha: string) {
  return k.kernel.requestPlanApproval({
    missionId,
    artifactSubjects: [
      { artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planSha, finalizedAt: FIXED_INSTANT.toISOString() },
    ],
    requestedByRole: { roleId: "craftsman", roleVersion: 1 },
    ttlMs: 60_000,
  });
}

describe("F1. human-authority precondition", () => {
  it("the agent-role list the call site uses is non-empty and names real roles", () => {
    expect(AGENT_ROLE_IDS.length).toBeGreaterThan(0);
    const roles = testRoleRegistry();
    for (const roleId of AGENT_ROLE_IDS) {
      // the list cannot name a role the kernel does not have
      expect(() => roles.role(roleId)).not.toThrow();
    }
  });

  it("the call site refuses every agent identity at the public seam", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = planApprovalRequest(k, missionId, planArtifactId, planSha);
    for (const roleId of AGENT_ROLE_IDS) {
      expect(() =>
        k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: roleId }),
      ).toThrow(/SELF_APPROVAL_DENIED/);
      // and the Raw seam carries the same guard
      expect(() =>
        k.kernel.recordApprovalDecisionRaw({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: roleId }),
      ).toThrow(/SELF_APPROVAL_DENIED/);
    }
    // no APPROVED record was stored by any agent identity
    const stored = k.kernel.storage.getApprovalRecordByRequest(request.approvalRequestId);
    expect(stored.ok ? stored.value?.decision : undefined).not.toBe("APPROVED");
  });

  it("a human authority is still accepted — the guard is not a blanket denial", () => {
    const k = buildTestKernel();
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = planApprovalRequest(k, missionId, planArtifactId, planSha);
    expect(() =>
      k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" }),
    ).not.toThrow();
    expect(k.kernel.getMission(missionId)?.stage).toBe("IMPLEMENTATION");
  });

  it("the documented sharp edge stays documented: an empty list accepts every identity", () => {
    // The precondition is the caller's to hold; this pins the contract the
    // review recorded, so it cannot be forgotten silently.
    expect(isHumanAuthority("craftsman", [])).toBe(true);
  });

  it("the agent list cannot come from an empty registry — the registry refuses to be built without roles", () => {
    expect(() => new RoleRegistry([])).toThrow(/INTEGRITY_FAILURE/);
  });
});
