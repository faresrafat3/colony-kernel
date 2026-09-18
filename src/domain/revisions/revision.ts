/** RevisionRequest — persisted type (schemaVersion 1, N6). Closed issue codes. */
import { sha256Hex } from "../support/sha256.js";

export type RevisionIssueCode =
  | "VERIFICATION_CONTENT_FAILURE"
  | "VERIFICATION_INFRASTRUCTURE_FAILURE"
  | "REVIEW_CHANGES_REQUESTED"
  | "DOCUMENTATION_BYTE_CHANGE"
  | "PACKAGE_REQUEST_CHANGE";

export interface RevisionRequest {
  schemaVersion: 1;
  revisionId: string;
  missionId: string;
  sourceArtifactId: string;
  sourceArtifactHash: string;
  requestedByRoleId: string;
  issueCode: RevisionIssueCode;
  severity: "content" | "infrastructure";
  evidence: readonly { artifactId: string; contentSha256: string }[];
  requiredChange: string;
  acceptanceTestIds: readonly string[];
  createdAt: string;
  expiresAt: string;
}

/** Dedupe key: identical input+artifact+role cannot be auto-retried (N6). */
export function revisionDedupeKey(input: {
  issueCode: RevisionIssueCode;
  sourceArtifactHash: string;
  requestedByRoleId: string;
}): string {
  const joined = [input.issueCode, input.sourceArtifactHash, input.requestedByRoleId].join("|");
  return sha256Hex(joined);
}
