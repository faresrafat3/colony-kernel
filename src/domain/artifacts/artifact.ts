/** ArtifactManifest — persisted type (schemaVersion 1, N5/N7). */
import { canonicalJson } from "../canonical/jcs.js";

export type ArtifactType =
  | "recon_brief"
  | "plan"
  | "plan_challenge"
  | "implementation_candidate"
  | "verification_report"
  | "technical_review"
  | "documentation_bundle"
  | "final_package";

export interface ArtifactManifest {
  schemaVersion: 1;
  artifactId: string;
  missionId: string;
  artifactType: ArtifactType;
  /** SHA-256 over the canonical artifact content bytes (content-addressed). */
  contentSha256: string;
  /** Producer role identity — trusted provenance, never model-supplied. */
  createdByRoleId: string;
  createdByRoleVersion: number;
  finalizedAt: string;
  /** Byte length of the canonical content. */
  contentBytes: number;
}

export interface ArtifactContent {
  /** Structured content fields — canonical JSON is the content-addressed form. */
  fields: Record<string, unknown>;
}

export function canonicalArtifactContent(content: ArtifactContent): string {
  return canonicalJson(content.fields);
}
