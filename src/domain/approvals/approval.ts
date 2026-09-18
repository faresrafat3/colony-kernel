/**
 * Content-addressed, transition-bound approval subjects (N1).
 * approvalSubjectHash = SHA-256 over RFC 8785 canonical bytes of the request.
 */
import { canonicalJson } from "../canonical/jcs.js";
import { sha256Hex } from "../support/sha256.js";

export type ApprovalPurpose = "PLAN_APPROVAL" | "PACKAGE_APPROVAL" | "BUDGET_TOPUP";
export type ActionClass = "LOCAL_READ" | "LOCAL_WRITE" | "PUBLIC_WRITE" | "BUDGET";
export type ApprovalDecision = "APPROVED" | "REJECTED";

export interface ArtifactSubjectRef {
  artifactId: string;
  artifactType: string;
  artifactSchemaVersion: number;
  contentSha256: string;
  finalizedAt: string;
}

export interface ApprovalRequest {
  schemaVersion: 1;
  approvalRequestId: string;
  missionId: string;
  missionStateVersion: number;
  requestedTransition: { fromState: string; toState: string };
  approvalPurpose: ApprovalPurpose;
  actionClass: ActionClass;
  requestedByRole: { roleId: string; roleVersion: number };
  /** Identity reference only — never a bearer token (N1). */
  requiredHumanAuthority: string;
  /** Sorted canonically by (artifactType, artifactId) — maintained at build. */
  artifactSubjects: readonly ArtifactSubjectRef[];
  policyVersion: string;
  roleVersions: Record<string, number>;
  issuedAt: string;
  expiresAt: string;
  /** Host-random ≥128 bits (hex). */
  nonce: string;
}

export interface ApprovalRecord {
  schemaVersion: 1;
  approvalRecordId: string;
  approvalRequestId: string;
  approvalSubjectHash: string;
  decision: ApprovalDecision;
  /** Authenticated human authority reference; agent identity is invalid. */
  decidedBy: string;
  decidedAt: string;
  /** Transport-authenticated proof descriptor; no secret material. */
  authorityProof: { method: string; reference: string };
  optionalReason: string | null;
}

/** Canonicalize artifact subjects by (artifactType, artifactId). */
export function sortArtifactSubjects(
  subjects: readonly ArtifactSubjectRef[],
): ArtifactSubjectRef[] {
  return [...subjects].sort((a, b) =>
    a.artifactType === b.artifactType
      ? a.artifactId < b.artifactId
        ? -1
        : a.artifactId > b.artifactId
          ? 1
          : 0
      : a.artifactType < b.artifactType
        ? -1
        : 1,
  );
}

export function approvalSubjectHash(request: ApprovalRequest): string {
  return sha256Hex(canonicalJson(request as unknown as Record<string, unknown>));
}

/** Human-authority identity: agents are never valid approvers (N1 req 10). */
export function isHumanAuthority(decidedBy: string, agentRoleIds: readonly string[]): boolean {
  return !agentRoleIds.includes(decidedBy);
}

/** Deterministic expiry check against the injected persistence clock. */
export function isExpiredAtCommit(request: ApprovalRequest, commitTime: Date): boolean {
  return new Date(request.expiresAt).getTime() <= commitTime.getTime();
}
