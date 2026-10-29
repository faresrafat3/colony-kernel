/**
 * F. Atomic effects: rows that must land with their event, or not at all.
 *
 * The split this pins down:
 * - Audit facts survive a refused transition (an approval record, a rejection).
 * - Effects do not: a ledger row, an approval request row, a consumption.
 *
 * Before this suite, `reserveBudget` wrote the ledger before the commit, so a
 * refused transition (ILLEGAL_TRANSITION on an ABORTED mission) still spent
 * capacity the event log never recorded. These tests fail on that tree.
 */
import { describe, expect, it } from "vitest";
import { buildTestKernel, FIXED_INSTANT } from "../../src/testing/builders/test-kernel.js";
import { applyEvent, canonicalPayloadHash } from "../../src/domain/events/apply-event.js";
import { KernelError } from "../../src/domain/errors/kernel-error.js";
import { approvalSubjectHash } from "../../src/domain/approvals/approval.js";
import { freshLedger } from "../../src/domain/budgets/ledger.js";

describe("F. atomic effects", () => {
  it("F-01: a failing effect rolls back the events, the state CAS and the effect's own writes", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    const before = k.kernel.getMission(missionId);
    if (before === undefined) throw new Error("missing state");
    const envelope = buildStartEnvelope(before.missionSequence + 1, before.stateVersion, missionId, k);

    const applied = k.storage.atomicApply(missionId, [envelope], before.stateVersion, applyEvent, () => {
      const wrote = k.storage.upsertLedger(missionId, "model_tokens", 0, freshLedger(missionId, "model_tokens", 100));
      expect(wrote.ok).toBe(true);
      throw new KernelError("INTERNAL_INVARIANT_VIOLATION", "effect refused", {});
    });

    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.error.code).toBe("INTERNAL_INVARIANT_VIOLATION");
    expect(k.kernel.getMission(missionId)?.stateVersion).toBe(before.stateVersion);
    const ledger = k.storage.getLedger(missionId, "model_tokens");
    expect(ledger.ok && ledger.value).toBeUndefined();
    expect(k.kernel.getEvents(missionId)).toHaveLength(1);
  });

  it("F-02: a refused budget command spends no capacity and appends no event", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    k.kernel.abortMission(missionId, "stop");
    k.kernel.setBudgetLimit(missionId, "model_tokens", 100);

    expect(() => k.kernel.reserveBudget(missionId, "model_tokens", 10)).toThrow(/ILLEGAL_TRANSITION/);

    const ledger = k.kernel.ledger(missionId, "model_tokens");
    expect(ledger.reserved).toBe(0);
    expect(ledger.ledgerVersion).toBe(0);
    expect(k.kernel.getEvents(missionId).filter((e) => e.eventType === "BUDGET_RESERVED")).toHaveLength(0);

    const rejections = k.storage.listRejections();
    expect(rejections.value.map((r) => r.code)).toEqual(["ILLEGAL_TRANSITION"]);
  });

  it("F-03: a refused top-up consumes no approval and does not move the limit", () => {
    const k = buildTestKernel();
    const { missionId } = k.kernel.createMission({ title: "t" });
    k.kernel.setBudgetLimit(missionId, "monetary_cost", 100);
    const approvalRecordId = approvedTopUp(k, missionId);
    k.kernel.abortMission(missionId, "stop");

    expect(() =>
      k.kernel.applyBudgetTopUp({ missionId, resourceClass: "monetary_cost", amount: 400, approvalRecordId }),
    ).toThrow(/ILLEGAL_TRANSITION/);

    expect(k.kernel.ledger(missionId, "monetary_cost").immutableLimit).toBe(100);
    expect(k.storage.isApprovalConsumed(approvalRecordId)).toBe(false);
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

/** Deterministic fake BUDGET_TOPUP approval seeded directly into storage. */
function approvedTopUp(k: ReturnType<typeof buildTestKernel>, missionId: string): string {
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
    decidedBy: "captain",
    decidedAt: FIXED_INSTANT.toISOString(),
    authorityProof: { method: "deterministic-test-authority", reference: "captain-test-key" },
    optionalReason: null,
  };
  k.kernel.storage.createApprovalRequest(request);
  k.kernel.storage.recordApprovalDecision(record);
  return record.approvalRecordId;
}
