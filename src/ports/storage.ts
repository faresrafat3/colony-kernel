/**
 * ColonyStorage port (N7). Colony-owned transactional semantics; no DSH
 * storage internals leak into the kernel. Milestone 1A binds the in-memory
 * adapter; a SQLite adapter satisfying the same contract is the M1B slice.
 */
import type { Result } from "../domain/errors/kernel-error.js";
import type { EventEnvelope } from "../domain/events/envelope.js";
import type { MissionState } from "../domain/mission/mission-state.js";
import type { ArtifactManifest } from "../domain/artifacts/artifact.js";
import type { ApprovalRequest, ApprovalRecord } from "../domain/approvals/approval.js";
import type { BudgetLedger, ResourceClass } from "../domain/budgets/ledger.js";

export interface StorageTransaction {
  /** Staged mutations; invisible to readers until commit. */
  commit(): Result<void>;
  rollback(): Result<void>;
}

export interface ColonyStorage {
  beginTransaction(): Result<StorageTransaction>;

  /** Event append + mission-state CAS in one transaction (N2 req 6, N7). */
  atomicApply(
    missionId: string,
    events: readonly EventEnvelope[],
    expectedStateVersion: number,
    reduce: (state: MissionState, event: EventEnvelope) => MissionState,
    /**
     * Rows that must land with the events or not at all: a ledger row, an
     * approval request, an approval consumption. Runs inside the transaction
     * after every event reduced; a throw rolls the whole commit back.
     *
     * Audit facts do NOT belong here. An approval decision and a durable
     * rejection must survive a refused transition (C-04, C-10, A04), and an
     * orphan artifact is harmless (H-03), so those are written outside.
     */
    effects?: (committed: MissionState) => void,
    /**
     * `alreadyApplied` is true when the batch was a delivery retry of an event
     * this store already holds: the call succeeds with `appended: 0` and no
     * state change (N2 req 2), so a retrying sender does not see an error.
     */
  ): Result<{ state: MissionState; appended: number; alreadyApplied?: boolean }>;

  appendEvent(envelope: EventEnvelope): Result<void>;
  getEventById(eventId: string): Result<EventEnvelope | undefined>;
  listEvents(missionId: string): Result<readonly EventEnvelope[]>;

  getMissionState(missionId: string): Result<MissionState | undefined>;
  /** Event append + mission-state CAS in one transaction (N7). */
  compareAndSwapMissionState(
    missionId: string,
    expectedVersion: number,
    nextState: MissionState,
    events: readonly EventEnvelope[],
  ): Result<void>;

  reserveMissionSequence(missionId: string): Result<number>;

  /** Immutable, content-addressed, no replacement (N7). */
  finalizeArtifact(manifest: ArtifactManifest): Result<void>;
  getArtifact(artifactId: string): Result<ArtifactManifest | undefined>;
  listArtifacts(missionId: string): Result<readonly ArtifactManifest[]>;

  createApprovalRequest(request: ApprovalRequest): Result<void>;
  getApprovalRequest(approvalRequestId: string): Result<ApprovalRequest | undefined>;
  recordApprovalDecision(record: ApprovalRecord): Result<void>;
  getApprovalRecord(approvalRecordId: string): Result<ApprovalRecord | undefined>;
  getApprovalRecordByRequest(approvalRequestId: string): Result<ApprovalRecord | undefined>;
  /** Consume at most once; transactional with the transition commit (N1). */
  consumeApproval(
    approvalRecordId: string,
    consumedByTransition: string,
    committedAt: string,
  ): Result<void>;

  /** Ledger row with optimistic CAS version per (missionId, class). */
  getLedger(missionId: string, resourceClass: ResourceClass): Result<BudgetLedger | undefined>;
  upsertLedger(
    missionId: string,
    resourceClass: ResourceClass,
    expectedVersion: number,
    next: BudgetLedger,
  ): Result<void>;

  /** Single-writer enforcement (N7 leases). */
  acquireLease(name: string, ttl: { expiresAt: string }): Result<void>;
  /** Extend a live lease; an absent or expired lease is not renewable (N7). */
  renewLease(name: string, ttl: { expiresAt: string }): Result<void>;
  releaseLease(name: string): Result<void>;

  /** Durable rejection audit (A04): rejections are recorded, never deleted. */
  recordRejection(rejection: {
    missionId: string | null;
    scope: string;
    code: string;
    detail: Record<string, unknown>;
    occurredAt: string;
  }): Result<void>;
  listRejections(): Result<readonly {
    missionId: string | null;
    scope: string;
    code: string;
    detail: Record<string, unknown>;
    occurredAt: string;
  }[]>;
}
