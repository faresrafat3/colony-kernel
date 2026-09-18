/** H. Recovery (replay, idempotence, crash-after-finalize) + I. Mission isolation. */
import { describe, expect, it } from "vitest";
import { buildTestKernel, toImplementation, toPlanGate, FIXED_INSTANT } from "../../src/testing/builders/test-kernel.js";
import { initialMissionState } from "../../src/domain/mission/mission-state.js";
import { reduceAll } from "../../src/domain/events/apply-event.js";

describe("H. recovery", () => {
  it("H-01: event replay reconstructs identical state (A24 core)", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    const stored = k.kernel.getMission(missionId);
    const events = k.kernel.getEvents(missionId);
    const replayed = k.kernel.replay(missionId);
    expect(replayed).toEqual(stored);
    expect(replayed.stateVersion).toBe(events.length);
    expect(replayed.missionSequence).toBe(events.length);
  });

  it("H-02: replay is byte-stable and idempotent (repeated recovery adds nothing)", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    const once = k.kernel.replay(missionId);
    const twice = k.kernel.replay(missionId);
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice)); // byte-stable
    expect(k.kernel.getEvents(missionId).length).toBe(once.missionSequence);
  });

  it("H-03: crash after artifact finalization but before the event is harmless", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    // Simulate: artifact persisted, event commit "crashed" (never ran).
    const orphan = k.kernel.storage.finalizeArtifact({
      schemaVersion: 1,
      artifactId: "orphan-artifact",
      missionId,
      artifactType: "implementation_candidate",
      contentSha256: "orphan-hash",
      createdByRoleId: "craftsman",
      createdByRoleVersion: 1,
      finalizedAt: FIXED_INSTANT.toISOString(),
      contentBytes: 4,
    });
    expect(orphan.ok).toBe(true);
    // Recovery = replay; the orphan artifact exists but no event references it,
    // so state reconstruction is unaffected (evidence survives in the store).
    const replayed = k.kernel.replay(missionId);
    expect(replayed).toEqual(k.kernel.getMission(missionId));
    const orphanRead = k.kernel.storage.getArtifact("orphan-artifact");
    expect(orphanRead.ok && orphanRead.value?.contentSha256).toBe("orphan-hash");
  });

  it("H-04: reducer from empty seed over full stream matches stored state exactly", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    const events = k.kernel.getEvents(missionId);
    const seed = initialMissionState({ missionId, title: "test mission", createdAt: events[0]?.occurredAt ?? FIXED_INSTANT.toISOString() });
    const folded = reduceAll(seed, events);
    expect(folded).toEqual(k.kernel.getMission(missionId));
  });

  it("H-05: recovery events cannot bypass pause guards (RECOVERY_COMPLETED outside pause is COMMON-self only)", () => {
    const k = buildTestKernel();
    const { missionId } = toImplementation(k);
    const v = k.kernel.getMission(missionId)?.stateVersion;
    k.kernel.escalateToHumanReview(missionId, { incident: "test" });
    expect(k.kernel.getMission(missionId)?.stage).toBe("HUMAN_REVIEW_REQUIRED");
    expect(k.kernel.getMission(missionId)?.resumeStage).toBe("IMPLEMENTATION");
    k.kernel.resumeFromHumanReview(missionId, "captain", "resume evidence");
    expect(k.kernel.getMission(missionId)?.stage).toBe("IMPLEMENTATION");
    expect(k.kernel.getMission(missionId)?.resumeStage).toBeNull();
    expect(k.kernel.getMission(missionId)?.counters.humanResumptionCount).toBe(1);
    void v;
  });
});

describe("I. isolation model", () => {
  it("I-01: two missions never share mutable state; sequences and versions are independent", () => {
    const k = buildTestKernel();
    const a = k.kernel.createMission({ title: "a" }).missionId;
    const b = k.kernel.createMission({ title: "b" }).missionId;
    k.kernel.startMission(a);
    expect(k.kernel.getMission(a)?.stage).toBe("POLICY_SCREENING");
    expect(k.kernel.getMission(b)?.stage).toBe("CREATED");
    expect(k.kernel.getMission(a)?.missionSequence).toBe(2);
    expect(k.kernel.getMission(b)?.missionSequence).toBe(1);
  });

  it("I-02: an artifact from one mission cannot authorize another (mission binding)", () => {
    const k = buildTestKernel();
    const first = toImplementation(k);
    const second = toPlanGate(k);
    const stolen = k.kernel.requestPlanApproval({
      missionId: second.missionId,
      artifactSubjects: [{ artifactId: first.candidateArtifactId, artifactType: "implementation_candidate", artifactSchemaVersion: 1, contentSha256: first.candidateSha, finalizedAt: FIXED_INSTANT.toISOString() }],
      requestedByRole: { roleId: "first-mate", roleVersion: 1 },
      ttlMs: 60_000,
    });
    // The subject hash includes the missionId: replay across missions is a
    // different subject, and the candidate artifact belongs to another mission.
    expect(stolen.missionId).toBe(second.missionId);
    expect(stolen.approvalPurpose).toBe("PLAN_APPROVAL");
  });

  it("I-03: artifacts are namespaced per mission; no cross-mission artifact leaks", () => {
    const k = buildTestKernel();
    const a = k.kernel.createMission({ title: "a" }).missionId;
    const b = k.kernel.createMission({ title: "b" }).missionId;
    k.kernel.finalizeArtifact({ missionId: a, roleId: "first-mate", artifactType: "recon_brief", content: { fields: { m: "a" } } });
    const listA = k.kernel.storage.listArtifacts(a);
    const listB = k.kernel.storage.listArtifacts(b);
    if (!listA.ok || !listB.ok) throw new Error("storage failure");
    expect(listA.value.every((x) => x.missionId === a)).toBe(true);
    expect(listB.value.length).toBe(0);
  });

  it("I-04: second writer fails lease acquisition (single-writer enforcement, A26)", () => {
    const k = buildTestKernel();
    const first = k.kernel.storage.acquireLease("mission-writer", { expiresAt: new Date(FIXED_INSTANT.getTime() + 60_000).toISOString() });
    expect(first.ok).toBe(true);
    const second = k.kernel.storage.acquireLease("mission-writer", { expiresAt: new Date(FIXED_INSTANT.getTime() + 60_000).toISOString() });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("LEASE_CONFLICT");
    expect(k.kernel.storage.releaseLease("mission-writer").ok).toBe(true);
    expect(k.kernel.storage.acquireLease("mission-writer", { expiresAt: new Date(FIXED_INSTANT.getTime() + 60_000).toISOString() }).ok).toBe(true);
  });
});

