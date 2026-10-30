/**
 * FakeAgentRuntime (mission §11): deterministic, scripted, zero-I/O agent
 * runtime. Never calls a model, never touches the network, never executes
 * shell commands, never reads arbitrary files.
 */
import { KernelError } from "../domain/errors/kernel-error.js";
import type { KernelErrorCode } from "../domain/errors/kernel-error.js";
import type {
  AgentRuntime,
  AgentInvocation,
  AgentInvocationRecord,
  InvocationOutcomeClass,
} from "../ports/agent-runtime.js";
import type { ArtifactContent } from "../domain/artifacts/artifact.js";
import { sha256Hex } from "../domain/support/sha256.js";

export type ScriptedResponse =
  | { kind: "success"; artifact: ArtifactContent; artifactType: string }
  | { kind: "malformed_output"; detail: Record<string, string | number | boolean> }
  | { kind: "timeout" }
  | { kind: "refusal"; detail: Record<string, string | number | boolean> }
  | { kind: "infrastructure_failure"; detail: Record<string, string | number | boolean> };

export class FakeAgentRuntime implements AgentRuntime {
  private readonly script: ScriptedResponse[];
  private cursor = 0;
  /** IdempotencyKey → the record already produced for it (port `duplicate`). */
  private readonly idempotent = new Map<string, AgentInvocationRecord>();
  readonly history: {
    invocation: AgentInvocation;
    outcomeClass: InvocationOutcomeClass | "capability_denied";
    responseFingerprint: string | null;
  }[] = [];

  constructor(script: readonly ScriptedResponse[]) {
    this.script = [...script];
  }

  invoke(request: AgentInvocation): { ok: true; value: AgentInvocationRecord } | { ok: false; error: KernelError } {
    // Input contract validation before anything else.
    if (request.input.objective.trim() === "") {
      return this.deny(request, new KernelError("INVALID_SCHEMA", "objective must be non-empty", {}));
    }
    if (request.attempt > request.maximumAttempts) {
      return this.deny(request, new KernelError("INVOCATION_LIMIT_EXCEEDED", "attempt exceeds maximumAttempts", {}));
    }
    // Idempotent replay: the same key already produced a record. Return it as
    // `duplicate` without consuming a script slot or touching history's state.
    const seen = this.idempotent.get(request.idempotencyKey);
    if (seen !== undefined) {
      const record: AgentInvocationRecord = { ...seen, outcomeClass: "duplicate" };
      this.history.push({ invocation: request, outcomeClass: "duplicate", responseFingerprint: record.responseFingerprint });
      return { ok: true, value: record };
    }
    const response = this.script[this.cursor];
    this.cursor += 1;
    if (response === undefined) {
      // A missing script entry is the harness running dry, not a policy denial:
      // classify it as infrastructure so the history agrees with the error code.
      return this.fail(request, "RUNTIME_INFRASTRUCTURE_FAILURE", { reason: "script_exhausted" });
    }
    switch (response.kind) {
      case "success": {
        const record: AgentInvocationRecord = {
          invocationId: request.invocationId,
          outcomeClass: "success",
          artifact: response.artifact,
          detail: { artifactType: response.artifactType },
          responseFingerprint: this.fingerprint(request, response),
        };
        this.idempotent.set(request.idempotencyKey, record);
        this.history.push({ invocation: request, outcomeClass: "success", responseFingerprint: record.responseFingerprint });
        return { ok: true, value: record };
      }
      case "malformed_output":
        return this.fail(request, "RUNTIME_MALFORMED_OUTPUT", response.detail);
      case "timeout":
        return this.fail(request, "RUNTIME_TIMEOUT", { timeoutMs: 0 });
      case "refusal":
        return this.fail(request, "RUNTIME_REFUSAL", response.detail);
      case "infrastructure_failure":
        return this.fail(request, "RUNTIME_INFRASTRUCTURE_FAILURE", response.detail);
    }
  }

  private fingerprint(request: AgentInvocation, marker: unknown): string {
    // Deterministic fingerprint over (invocationId, capability, objective).
    return sha256Hex(`${request.invocationId}|${request.capabilityId}|${request.input.objective}|${JSON.stringify(marker)}`);
  }

  private deny(request: AgentInvocation, error: KernelError) {
    this.history.push({ invocation: request, outcomeClass: "capability_denied", responseFingerprint: null });
    return { ok: false as const, error };
  }

  private fail(request: AgentInvocation, code: KernelErrorCode, detail: Record<string, string | number | boolean>) {
    const error = new KernelError(code, `scripted ${code.toLowerCase()}`, detail);
    this.history.push({ invocation: request, outcomeClass: code.replace("RUNTIME_", "").toLowerCase() as InvocationOutcomeClass, responseFingerprint: null });
    return { ok: false as const, error };
  }
}
