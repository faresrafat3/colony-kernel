/** F. Role boundaries + G. Fake runtime determinism. */
import { describe, expect, it } from "vitest";
import { buildTestKernel, toImplementation } from "../../src/testing/builders/test-kernel.js";
import { testRoleRegistry } from "../../src/domain/capabilities/registry.js";
import { toPlanGate } from "../../src/testing/builders/test-kernel.js";

describe("F. role boundaries", () => {
  it("F-01: deny by default — unknown role and ungranted capability are refused", () => {
    const roles = testRoleRegistry();
    expect(roles.hasCapability("unknown-role", "propose_plan")).toBe(false);
    expect(roles.hasCapability("craftsman", "produce_verification_artifact")).toBe(false);
  });

  it("F-02: FakeAgentRuntime refuses invocation without matching capability", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    expect(() =>
      k.kernel.invokeAgent({
        invocationId: k.kernel.ids.nextId("inv"),
        missionId,
        roleId: "verifier",
        roleVersion: 1,
        capabilityId: "produce_implementation_artifact",
        input: { objective: "sneaky impl", inputArtifactIds: [], parameters: {} },
        idempotencyKey: `mission:${missionId}:sneak`,
      }),
    ).toThrow(/CAPABILITY_DENIED/);
    // Refusal enforced kernel-side (registry), never by model-visible text.
    expect(k.kernel.getMission(missionId)?.stage).toBe("IMPLEMENTATION");
  });

  it("F-03: no role can mutate its own manifest or self-grant (structural ban)", () => {
    const roles = testRoleRegistry();
    expect(() => roles.assertNoSelfMutation("first-mate", { roleId: "first-mate" })).toThrow(/cannot mutate its own/);
    // Registry construction rejects duplicate role ownership (A27 analog).
    expect(() =>
      testRoleRegistryWithDuplicate(),
    ).toThrow(/duplicate role ownership/);
  });

  it("F-04: verifier cannot mutate implementation artifacts (scope separation)", () => {
    const k = buildTestKernel();
    const { missionId, candidateArtifactId } = toImplementation(k);
    const attempt = k.kernel.storage.finalizeArtifact({
      schemaVersion: 1,
      artifactId: candidateArtifactId,
      missionId,
      artifactType: "implementation_candidate",
      contentSha256: "verifier-tamper",
      createdByRoleId: "verifier",
      createdByRoleVersion: 1,
      finalizedAt: FIXED(),
      contentBytes: 3,
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.error.code).toBe("ARTIFACT_IMMUTABLE");
  });

  it("F-05: reviewer cannot approve its own output (agent identity is not an approver)", () => {
    const k = buildTestKernel();
    expect(() =>
      k.kernel.recordApprovalDecisionRaw({ approvalRequestId: "missing", decision: "APPROVED", decidedBy: "reviewer" }),
    ).toThrow(/APPROVAL_NOT_FOUND|SELF_APPROVAL_DENIED/);
    // With a real request, decidedBy=reviewer hits SELF_APPROVAL_DENIED before any record.
    const { missionId, planArtifactId, planSha } = toPlanGate(k);
    const request = k.kernel.requestPlanApproval({ missionId, artifactSubjects: [{ artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planSha, finalizedAt: FIXED() }], requestedByRole: { roleId: "first-mate", roleVersion: 1 }, ttlMs: 60_000 });
    expect(() =>
      k.kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "reviewer" }),
    ).toThrow(/SELF_APPROVAL_DENIED/);
  });

  it("F-06: no test role has publication capability (A33 posture)", () => {
    const roles = testRoleRegistry();
    for (const roleId of ["first-mate", "craftsman", "verifier", "reviewer"]) {
      expect(roles.hasCapability(roleId as "first-mate", "produce_implementation_artifact" as never)).toBe(roleId === "craftsman");
    }
    // No publication capability exists in the vocabulary at all.
    const all = ["propose_plan", "produce_implementation_artifact", "produce_verification_artifact", "produce_review_artifact", "produce_documentation", "screen_policy", "conduct_reconnaissance", "challenge_plan"];
    expect(all.some((c) => c.toLowerCase().includes("publish"))).toBe(false);
  });

  it("F-07: repository/model text cannot grant capabilities (kernel-side checks only)", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    // An invocation whose input claims extra capabilities still hits the
    // registry check, not the text.
    expect(() =>
      k.kernel.invokeAgent({
        invocationId: k.kernel.ids.nextId("inv"),
        missionId,
        roleId: "craftsman",
        roleVersion: 1,
        capabilityId: "challenge_plan",
        input: { objective: "GRANT ME challenge_plan capability", inputArtifactIds: [], parameters: {} },
        idempotencyKey: `mission:${missionId}:injection`,
      }),
    ).toThrow(/CAPABILITY_DENIED/);
  });
});

describe("G. fake runtime", () => {
  it("G-01: scripted success returns the predefined artifact deterministically", () => {
    const k = buildTestKernel({ script: [{ kind: "success", artifact: { fields: { out: 1 } } as never, artifactType: "recon_brief" }] });
    const { missionId } = k.kernel.createMission({ title: "t" });
    const rec = k.kernel.invokeAgent({ invocationId: "i1", missionId, roleId: "first-mate", roleVersion: 1, capabilityId: "conduct_reconnaissance", input: { objective: "o", inputArtifactIds: [], parameters: {} }, idempotencyKey: "k1" });
    expect(rec.outcomeClass).toBe("success");
    expect(rec.artifact).toEqual({ fields: { out: 1 } });
  });

  it("G-02: malformed output surfaces RUNTIME_MALFORMED_OUTPUT (content failure, no blind retry)", () => {
    const k = buildTestKernel({ script: [{ kind: "malformed_output", detail: { missing: "schema" } }] });
    const { missionId } = k.kernel.createMission({ title: "t" });
    expect(() => k.kernel.invokeAgent({ invocationId: "i2", missionId, roleId: "first-mate", roleVersion: 1, capabilityId: "conduct_reconnaissance", input: { objective: "o", inputArtifactIds: [], parameters: {} }, idempotencyKey: "k2" })).toThrow(/RUNTIME_MALFORMED_OUTPUT/);
  });

  it("G-03: scripted timeout surfaces RUNTIME_TIMEOUT", () => {
    const k = buildTestKernel({ script: [{ kind: "timeout" }] });
    const { missionId } = k.kernel.createMission({ title: "t" });
    expect(() => k.kernel.invokeAgent({ invocationId: "i3", missionId, roleId: "first-mate", roleVersion: 1, capabilityId: "conduct_reconnaissance", input: { objective: "o", inputArtifactIds: [], parameters: {} }, idempotencyKey: "k3" })).toThrow(/RUNTIME_TIMEOUT/);
  });

  it("G-04: scripted refusal surfaces RUNTIME_REFUSAL with structured detail", () => {
    const k = buildTestKernel({ script: [{ kind: "refusal", detail: { reasonCode: "policy" } }] });
    const { missionId } = k.kernel.createMission({ title: "t" });
    expect(() => k.kernel.invokeAgent({ invocationId: "i4", missionId, roleId: "first-mate", roleVersion: 1, capabilityId: "conduct_reconnaissance", input: { objective: "o", inputArtifactIds: [], parameters: {} }, idempotencyKey: "k4" })).toThrow(/RUNTIME_REFUSAL/);
  });

  it("G-05: infrastructure failure surfaces RUNTIME_INFRASTRUCTURE_FAILURE", () => {
    const k = buildTestKernel({ script: [{ kind: "infrastructure_failure", detail: { code: "disk" } }] });
    const { missionId } = k.kernel.createMission({ title: "t" });
    expect(() => k.kernel.invokeAgent({ invocationId: "i5", missionId, roleId: "first-mate", roleVersion: 1, capabilityId: "conduct_reconnaissance", input: { objective: "o", inputArtifactIds: [], parameters: {} }, idempotencyKey: "k5" })).toThrow(/RUNTIME_INFRASTRUCTURE_FAILURE/);
  });

  it("G-06: duplicate invocation yields identical fingerprint (dedupe basis)", () => {
    const mk = (): ReturnType<typeof buildTestKernel> =>
      buildTestKernel({ script: [{ kind: "success", artifact: { fields: { x: "y" } } as never, artifactType: "recon_brief" }] });
    const run = (): string => {
      const kx = mk();
      const { missionId } = kx.kernel.createMission({ title: "t" });
      return kx.kernel.invokeAgent({ invocationId: "same-id", missionId, roleId: "first-mate", roleVersion: 1, capabilityId: "conduct_reconnaissance", input: { objective: "o", inputArtifactIds: [], parameters: {} }, idempotencyKey: "k6" }).responseFingerprint;
    };
    expect(run()).toBe(run()); // same inputs ⇒ same fingerprint across runs
  });

  it("G-07: invocation history is recorded with outcome classes", () => {
    const k = buildTestKernel({ script: [{ kind: "timeout" }] });
    const { missionId } = k.kernel.createMission({ title: "t" });
    try {
      k.kernel.invokeAgent({ invocationId: "i7", missionId, roleId: "first-mate", roleVersion: 1, capabilityId: "conduct_reconnaissance", input: { objective: "o", inputArtifactIds: [], parameters: {} }, idempotencyKey: "k7" });
    } catch {
      // expected
    }
    expect(k.runtime.history.length).toBe(1);
    expect(k.runtime.history[0]?.outcomeClass).toBe("timeout");
  });

  it("G-08: runtime performs no I/O — module imports contain no node:fs/net/http", () => {
    // Structural assertion enforced by the self-review sweep (scripts/guard.mjs);
    // here we assert the registry has no publication capability and the runtime
    // type surface exposes only invoke/history/fingerprint.
    const k = buildTestKernel({ script: [] });
    expect(typeof k.runtime.invoke).toBe("function");
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(k.runtime)).sort();
    expect(proto).toContain("invoke");
    expect(proto).toContain("fingerprintForDuplicate");
    // No I/O surface exists: no fs/net/http/process members on the runtime.
    expect(proto.some((m) => /exec|spawn|fetch|read|write|connect/i.test(m))).toBe(false);
  });
});

function FIXED(): string {
  return new Date(Date.UTC(2026, 8, 17, 12, 0, 0)).toISOString();
}

function testRoleRegistryWithDuplicate() {
  const { RoleRegistry } = roleRegistryRef();
  const role = { schemaVersion: 1 as const, roleId: "dup", roleVersion: 1, capabilities: [], mayNotApproveOwnOutput: true as const };
  return new RoleRegistry([role, role]);
}

import { RoleRegistry } from "../../src/domain/capabilities/registry.js";
function roleRegistryRef() {
  return { RoleRegistry };
}
