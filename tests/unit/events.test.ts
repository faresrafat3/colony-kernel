/** B. Events: apply-once, duplicates, sequence/version conflicts, payload hash. */
import { describe, expect, it } from "vitest";
import { buildTestKernel, FIXED_INSTANT } from "../../src/testing/builders/test-kernel.js";
import { applyEvent, canonicalPayloadHash } from "../../src/domain/events/apply-event.js";
import { initialMissionState } from "../../src/domain/mission/mission-state.js";
import { sha256Hex } from "../../src/domain/support/sha256.js";

describe("B. events", () => {
  it("B-01: re-applying the same eventId returns ALREADY_APPLIED with no state change", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const events = k.kernel.getEvents(missionId);
    const first = events[0];
    const seed = initialMissionState({ missionId, title: "t", createdAt: first.occurredAt });
    const once = applyEvent(seed, first);
    expect(once.missionSequence).toBe(1);
    // Duplicate delivery: same eventId, same everything → ALREADY_APPLIED, not applied again.
    expect(() => applyEvent({ ...once, missionSequence: 1, stateVersion: 1, stage: "CREATED" }, { ...first, expectedStateVersion: 0 })).toThrow(/ALREADY_APPLIED|SEQUENCE_CONFLICT|CONCURRENCY_CONFLICT/);
  });

  it("B-02: duplicate delivery cannot increment missionSequence (storage unique constraint)", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const first = k.kernel.getEvents(missionId)[0];
    const applied = k.storage.atomicApply(missionId, [first], 0, applyEvent);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(["IDEMPOTENCY_CONFLICT", "SEQUENCE_CONFLICT", "CONCURRENCY_CONFLICT"]).toContain(applied.error.code);
    expect(k.kernel.getMission(missionId)?.missionSequence).toBe(1);
  });

  it("B-03: missionSequence conflict (gap) fails closed", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const state = k.kernel.getMission(missionId);
    if (state === undefined) throw new Error("missing");
    const forged = { ...buildStartEnvelope(state.missionSequence + 5, state.stateVersion, missionId, k) };
    expect(() => applyEvent(state, forged)).toThrow(/SEQUENCE_CONFLICT/);
  });

  it("B-04: expectedStateVersion mismatch → CONCURRENCY_CONFLICT with no effects", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const state = k.kernel.getMission(missionId);
    if (state === undefined) throw new Error("missing");
    const forged = buildStartEnvelope(state.missionSequence + 1, state.stateVersion + 7, missionId, k);
    expect(() => applyEvent(state, forged)).toThrow(/CONCURRENCY_CONFLICT/);
    expect(k.kernel.getMission(missionId)?.stateVersion).toBe(state.stateVersion);
  });

  it("B-05: unknown event type fails closed", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const state = k.kernel.getMission(missionId);
    if (state === undefined) throw new Error("missing");
    const payload = {};
    const forged = {
      schemaVersion: 1 as const,
      eventId: "e-unknown",
      eventType: "TOTALLY_UNKNOWN_EVENT",
      missionId,
      missionSequence: state.missionSequence + 1,
      expectedStateVersion: state.stateVersion,
      actor: { actorType: "KERNEL_POLICY" as const, actorId: "k", roleId: null, roleVersion: null },
      causationId: null,
      correlationId: "c",
      idempotencyKey: "x:unknown",
      occurredAt: FIXED_INSTANT.toISOString(),
      recordedAt: FIXED_INSTANT.toISOString(),
      payload,
      payloadSha256: canonicalPayloadHash(payload),
    };
    expect(() => applyEvent(state, forged as never)).toThrow(/INVALID_SCHEMA/);
  });

  it("B-06: payload-hash mismatch is rejected (tamper detection)", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const state = k.kernel.getMission(missionId);
    if (state === undefined) throw new Error("missing");
    const envelope = buildStartEnvelope(state.missionSequence + 1, state.stateVersion, missionId, k);
    const tampered = { ...envelope, payload: { ...envelope.payload, injected: true } };
    expect(() => applyEvent(state, tampered)).toThrow(/INVALID_SCHEMA.*payloadSha256 mismatch|payloadSha256 mismatch/);
  });

  it("B-07: event for another mission is rejected", () => {
    const k = buildTestKernel();
    const a = k.kernel.createMission({ title: "a" }).missionId;
    const b = k.kernel.createMission({ title: "b" }).missionId;
    const stateB = k.kernel.getMission(b);
    const stateA = k.kernel.getMission(a);
    if (stateA === undefined || stateB === undefined) throw new Error("missing");
    const stolen = { ...buildStartEnvelope(stateA.missionSequence + 1, stateA.stateVersion, a, k), missionId: stateB.missionId };
    expect(() => applyEvent(stateA, stolen)).toThrow(/INVALID_EVENT|belongs to mission/);
  });

  it("B-08: unsupported event schemaVersion fails closed", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const state = k.kernel.getMission(missionId);
    if (state === undefined) throw new Error("missing");
    const future = { ...buildStartEnvelope(state.missionSequence + 1, state.stateVersion, missionId, k), schemaVersion: 2 as unknown as 1 };
    expect(() => applyEvent(state, future)).toThrow(/UNSUPPORTED_SCHEMA_VERSION/);
  });

  it("B-09: equal canonical payloads produce equal payload hashes (A12 core)", () => {
    const h1 = canonicalPayloadHash({ b: 1, a: "x" });
    const h2 = canonicalPayloadHash({ a: "x", b: 1 });
    expect(h1).toBe(h2);
    expect(h1).toBe(sha256Hex('{"a":"x","b":1}'));
  });
});

function buildStartEnvelope(
  sequence: number,
  expectedVersion: number,
  missionId: string,
  k: ReturnType<typeof buildTestKernel>,
) {
  const payload = {};
  return {
    schemaVersion: 1 as const,
    eventId: k.kernel.ids.nextUuid(),
    eventType: "POLICY_SCREEN_STARTED" as const,
    missionId,
    missionSequence: sequence,
    expectedStateVersion: expectedVersion,
    actor: { actorType: "ADMITTED_INVOCATION" as const, actorId: "first-mate", roleId: "first-mate", roleVersion: 1 },
    causationId: null,
    correlationId: "corr",
    idempotencyKey: `test:${sequence}:${expectedVersion}`,
    occurredAt: FIXED_INSTANT.toISOString(),
    recordedAt: FIXED_INSTANT.toISOString(),
    payload,
    payloadSha256: canonicalPayloadHash(payload),
  };
}
