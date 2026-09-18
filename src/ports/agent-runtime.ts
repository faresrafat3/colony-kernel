/**
 * AgentRuntime port (Colony-owned; N9). The domain never imports DSH: a real
 * DSH-backed adapter would implement this interface in a later milestone.
 * Milestone 1A binds the deterministic FakeAgentRuntime.
 */
import type { Result } from "../domain/errors/kernel-error.js";
import type { ArtifactContent } from "../domain/artifacts/artifact.js";

export type InvocationOutcomeClass =
  | "success"
  | "malformed_output"
  | "timeout"
  | "refusal"
  | "duplicate"
  | "infrastructure_failure";

export interface AgentInvocation {
  invocationId: string;
  missionId: string;
  roleId: string;
  roleVersion: number;
  capabilityId: string;
  /** Structured, validated input contract (no free prose execution channel). */
  input: {
    objective: string;
    inputArtifactIds: readonly string[];
    /** Deterministic parameters consumed by the fake runtime. */
    parameters: Record<string, string | number | boolean>;
  };
  idempotencyKey: string;
  attempt: number;
  maximumAttempts: number;
}

export interface AgentInvocationRecord {
  invocationId: string;
  outcomeClass: InvocationOutcomeClass;
  /** Produced artifact content on success (content-addressed downstream). */
  artifact?: ArtifactContent;
  /** Structured refusal/timeout detail; never granted capabilities by text. */
  detail?: Record<string, string | number | boolean>;
  /** Fingerprint for duplicate-response dedupe (same key → same record). */
  responseFingerprint: string;
}

export interface AgentRuntime {
  /**
   * Execute one invocation against the runtime. Deterministic: same inputs and
   * same scripted schedule produce the same record. The runtime performs no
   * I/O, no network, no process execution and never reads arbitrary files.
   */
  invoke(request: AgentInvocation): Result<AgentInvocationRecord>;
}
