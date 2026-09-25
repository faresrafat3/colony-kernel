/**
 * K. telemetry — the per-command telemetry invariant.
 *
 * ARCHITECTURE.md "Control flow of one command" ends every command with
 * "→ telemetry record → return new state / receipt". Two commands commit
 * through `storage.atomicApply` directly instead of `commit()`, so they had to
 * emit that entry themselves — and the publish gate and the revision path
 * quietly did not. Nothing asserted telemetry at all, so the drift was
 * invisible. This is the guard.
 *
 * Telemetry is a derived view and never authorizes anything (v0.1 §15), so
 * asserting on it can never mask a gate failure.
 */
import { describe, expect, it } from "vitest";
import { buildTestKernel, toImplementation, toPackageGate } from "../../src/testing/builders/test-kernel.js";

describe("K. telemetry", () => {
  it("K-01: every accepted command emits exactly one telemetry entry (both gates, plus a revision request)", () => {
    // 1. Both human gates must be observable. The publish gate emitted nothing
    //    before this test existed; the plan gate always did.
    const gated = buildTestKernel();
    const { missionId: gatedMissionId } = toPackageGate(gated);
    const gateRequests = gated.telemetry.entries.filter(
      (e) => e.kind === "approval" && e.code === "APPROVAL_REQUESTED",
    );
    expect(gateRequests).toHaveLength(2);
    // Both entries name the same mission and carry a subject hash — never a bearer token.
    expect(gateRequests.map((e) => e.missionId)).toEqual([gatedMissionId, gatedMissionId]);
    for (const entry of gateRequests) {
      expect(typeof entry.detail?.["subjectHash"]).toBe("string");
    }

    // 2. A revision request commits a transition through `storage.atomicApply`
    //    directly, so it must emit the same entry `commit()` emits.
    const revised = buildTestKernel();
    const { missionId } = toImplementation(revised);
    revised.kernel.completeImplementation(missionId); // IMPLEMENTATION → VERIFICATION (E14)
    const before = revised.telemetry.entries.length;
    const revision = revised.kernel.requestRevision({
      missionId,
      sourceArtifactId: "artifact-under-review",
      sourceArtifactHash: "0".repeat(64),
      requestedByRole: "verifier",
      issueCode: "VERIFICATION_CONTENT_FAILURE",
      severity: "content",
      evidence: [],
      requiredChange: "re-run the failing case",
    });
    expect(revised.kernel.getMission(missionId)?.stage).toBe("REVISION");
    const added = revised.telemetry.entries.slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ kind: "transition", missionId, code: "REVISION", detail: { events: 1 } });
    expect(revision.issueCode).toBe("VERIFICATION_CONTENT_FAILURE");

    // 3. The invariant itself: no accepted command is silent. Every command in
    //    the mission's committed history is accountable for exactly one entry,
    //    and every entry names a mission and a code.
    const events = revised.kernel.getEvents(missionId);
    const accountable = revised.telemetry.entries.filter((e) => e.kind === "transition" || e.kind === "approval");
    expect(events.length).toBeGreaterThan(0);
    expect(accountable.length).toBe(events.length);
    for (const entry of revised.telemetry.entries) {
      expect(entry.code).not.toBe("");
      expect(entry.missionId).toBe(missionId);
    }
  });
});
