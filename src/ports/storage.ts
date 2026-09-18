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
  ): Result<{ state: MissionState; appended: number }>;

  appendEvent(envelope: EventEnvelope): Result<void>;
  getEventById(eventId: string): Result<EventEnvelope | undefined>;
  listEvents(missionId: string): Result<readonly EventEnvelope[]>;

  getMissionState(missionId: string): Result<MissionState | undefined>;
  compareAndSwapMissionState(
    missionId: string,
    expectedVersion: number,
    nextState: MissionState,
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
