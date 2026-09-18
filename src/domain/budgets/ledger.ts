/**
 * Budget ledger (N4). Per-mission, per-resource-class. Immutable limit,
 * append-only top-ups, CAS-versioned rows, no overspend at any commit.
 */
import { KernelError } from "../errors/kernel-error.js";

export type ResourceClass =
  | "model_tokens"
  | "wall_clock_ms"
  | "tool_calls"
  | "monetary_cost"
  | "revision_cycles";

export const TOPUP_ALLOWED_CLASSES: ReadonlySet<ResourceClass> = new Set([
  "model_tokens",
  "wall_clock_ms",
  "tool_calls",
  "monetary_cost",
]);

/** revision_cycles (and any rework counter) MUST NOT be topped up (N4 req 13/Captain). */
export const TOPUP_FORBIDDEN_CLASSES: ReadonlySet<ResourceClass> = new Set(["revision_cycles"]);

export interface BudgetTopUp {
  topUpId: string;
  amount: number;
  approvalRecordId: string;
  approvalSubjectHash: string;
  appliedAt: string;
}

export interface BudgetLedger {
  schemaVersion: 1;
  missionId: string;
  resourceClass: ResourceClass;
  immutableLimit: number;
  approvedTopUps: readonly BudgetTopUp[];
  reserved: number;
  spent: number;
  releasedReservations: number;
  /** Optimistic-concurrency version of the ledger row. */
  ledgerVersion: number;
}

export interface LedgerView {
  effectiveLimit: number;
  remainingCapacity: number;
}

export function effectiveLimit(ledger: BudgetLedger): number {
  return ledger.immutableLimit + ledger.approvedTopUps.reduce((sum, t) => sum + t.amount, 0);
}

export function remainingCapacity(ledger: BudgetLedger): number {
  return effectiveLimit(ledger) - ledger.reserved - ledger.spent;
}

export function ledgerView(ledger: BudgetLedger): LedgerView {
  return { effectiveLimit: effectiveLimit(ledger), remainingCapacity: remainingCapacity(ledger) };
}

export function assertLedgerInvariants(ledger: BudgetLedger): void {
  if (ledger.reserved < 0 || ledger.spent < 0) {
    throw new KernelError("INTEGRITY_FAILURE", "negative reserved/spent", {});
  }
  if (ledger.spent + ledger.reserved > effectiveLimit(ledger)) {
    throw new KernelError("BUDGET_EXCEEDED", "spent+reserved exceeds effectiveLimit", {
      spent: ledger.spent,
      reserved: ledger.reserved,
      effectiveLimit: effectiveLimit(ledger),
    });
  }
}

export function freshLedger(
  missionId: string,
  resourceClass: ResourceClass,
  immutableLimit: number,
): BudgetLedger {
  return {
    schemaVersion: 1,
    missionId,
    resourceClass,
    immutableLimit,
    approvedTopUps: [],
    reserved: 0,
    spent: 0,
    releasedReservations: 0,
    ledgerVersion: 0,
  };
}

/** Reserve with CAS on ledgerVersion (N4 req 12 optimistic equivalent). */
export function reserve(ledger: BudgetLedger, amount: number): BudgetLedger {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new KernelError("INVALID_SCHEMA", "reservation amount must be a positive integer", { amount });
  }
  if (remainingCapacity(ledger) < amount) {
    throw new KernelError("INSUFFICIENT_CAPACITY", "reservation exceeds remainingCapacity", {
      requested: amount,
      remainingCapacity: remainingCapacity(ledger),
    });
  }
  return withVersion({ ...ledger, reserved: ledger.reserved + amount });
}

/** Settlement transfers amount from reserved to spent, atomically (N4 req 8). */
export function settle(ledger: BudgetLedger, reservationId: string, amount: number): BudgetLedger {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new KernelError("INVALID_SCHEMA", "settlement amount must be a positive integer", { amount });
  }
  if (ledger.reserved < amount) {
    throw new KernelError("INTEGRITY_FAILURE", "settlement exceeds held reservation", {
      reserved: ledger.reserved,
      amount,
    });
  }
  if (ledger.spent + amount > effectiveLimit(ledger)) {
    throw new KernelError("BUDGET_EXCEEDED", "settlement would exceed effectiveLimit", {});
  }
  return withVersion({ ...ledger, reserved: ledger.reserved - amount, spent: ledger.spent + amount });
}

/** Cancellation releases without touching spent (N4 req 9). */
export function release(ledger: BudgetLedger, amount: number): BudgetLedger {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new KernelError("INVALID_SCHEMA", "release amount must be a positive integer", { amount });
  }
  if (ledger.reserved < amount) {
    throw new KernelError("INTEGRITY_FAILURE", "release exceeds held reservation", { reserved: ledger.reserved });
  }
  return withVersion({
    ...ledger,
    reserved: ledger.reserved - amount,
    releasedReservations: ledger.releasedReservations + amount,
  });
}

/** Top-up application; class restriction is enforced by the caller (N4 req 3). */
export function applyTopUp(ledger: BudgetLedger, topUp: BudgetTopUp): BudgetLedger {
  return withVersion({ ...ledger, approvedTopUps: [...ledger.approvedTopUps, topUp] });
}

/** Any attempt to mutate immutableLimit is an integrity failure (N4 req 2). */
export function withLimitMutation(ledger: BudgetLedger): never {
  throw new KernelError("INTEGRITY_FAILURE", "immutableLimit mutation is forbidden", {
    missionId: ledger.missionId,
    resourceClass: ledger.resourceClass,
  });
}

function withVersion(ledger: BudgetLedger): BudgetLedger {
  return { ...ledger, ledgerVersion: ledger.ledgerVersion + 1 };
}
