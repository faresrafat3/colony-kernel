/**
 * HermesAgentRuntime — a real host adapter for the Colony AgentRuntime port.
 *
 * WHAT THIS IS
 * ------------
 * The port says: "a real DSH-backed adapter would implement this interface in a
 * later milestone." This is that adapter for a different host — Hermes Agent.
 * It proves the port is genuinely host-agnostic: two unrelated hosts implement
 * the same interface, and the kernel's domain code is untouched either way.
 *
 * THE DESIGN RULE
 * ---------------
 * This adapter TRANSPORTS; it never DECIDES. Everything the kernel is responsible
 * for stays the kernel's:
 *
 *   - whether the role may invoke at all      -> kernel (roles.assertCapability)
 *   - whether the mission is in a legal stage -> kernel (edge table)
 *   - whether an approval is required         -> kernel
 *   - whether a produced artifact is accepted -> kernel
 *
 * What the adapter does: take a validated AgentInvocation, hand it to a host
 * agent process, and classify what came back into the port's closed outcome
 * vocabulary. Nothing more. A host reply that says "this passed" is a
 * `success` with an artifact — never a verification result. That distinction is
 * the whole point of the project, and an adapter that blurred it would undo it.
 *
 * DETERMINISM
 * -----------
 * A live host is not deterministic. So this adapter has two modes:
 *
 *   scripted  — a fixed schedule, no I/O, byte-identical reruns. The default,
 *               and what the project's own demo gate requires.
 *   live      — a real subprocess call, explicitly opted into.
 *
 * The kernel's determinism guarantees hold in `scripted` mode and are explicitly
 * NOT claimed in `live` mode. GOVERNANCE R6 forbids presenting one as the other,
 * so `mode` is part of the adapter's identity and `isDeterministic` reports it.
 */
import { spawnSync } from "node:child_process";

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

export type HermesRuntimeMode = "scripted" | "live";

/** One entry in the scripted schedule, mirroring FakeAgentRuntime's shape. */
export type HermesScriptedResponse =
  | { kind: "success"; artifact: ArtifactContent; artifactType: string }
  | { kind: "malformed_output"; detail: Record<string, string | number | boolean> }
  | { kind: "timeout" }
  | { kind: "refusal"; detail: Record<string, string | number | boolean> }
  | { kind: "infrastructure_failure"; detail: Record<string, string | number | boolean> };

export interface HermesAgentRuntimeOptions {
  /**
   * `scripted` (default) replays a fixed schedule with zero I/O.
   * `live` shells out to a Hermes profile. Never the default: a live call makes
   * the demo non-reproducible, and R3 asserts byte-identical reruns.
   */
  mode?: HermesRuntimeMode;
  /** Required in scripted mode. Ignored in live mode. */
  script?: readonly HermesScriptedResponse[];
  /** Hermes profile to drive in live mode, e.g. "scout". */
  profile?: string;
  /** Wall-clock budget for one live invocation, milliseconds. */
  timeoutMs?: number;
  /** Injected clock, so even live-mode timestamps are reproducible in tests. */
  now?: () => Date;
  /** Injected runner, so live mode is testable without spawning anything. */
  run?: (command: string, args: readonly string[], timeoutMs: number) => {
    status: number | null;
    stdout: string;
    stderr: string;
    signal: NodeJS.Signals | null;
    error?: Error;
  };
}

/**
 * The host's own vocabulary, mapped onto the port's closed vocabulary.
 *
 * A host that answers in prose must be classified by an EXPLICIT rule, never by
 * a substring match on whatever it happened to say. The rules below are the only
 * places a host string becomes an outcome class.
 */
const HOST_REFUSAL_MARKERS = [
  "out of front", // the crew's own out-of-scope rule
  "out-of-front",
  "خارج النطاق",
  "cannot take this",
  "not my front",
];

export class HermesAgentRuntime implements AgentRuntime {
  private readonly mode: HermesRuntimeMode;
  private readonly script: HermesScriptedResponse[];
  private readonly profile: string;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly run: NonNullable<HermesAgentRuntimeOptions["run"]>;
  private cursor = 0;

  /** Invocations this adapter actually sent to the host. Inspectable, not silent. */
  readonly history: {
    invocation: AgentInvocation;
    outcomeClass: InvocationOutcomeClass | "capability_denied";
    responseFingerprint: string | null;
  }[] = [];

  constructor(options: HermesAgentRuntimeOptions = {}) {
    this.mode = options.mode ?? "scripted";
    this.script = [...(options.script ?? [])];
    this.profile = options.profile ?? "";
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.now = options.now ?? (() => new Date());
    this.run = options.run ?? defaultRunner;

    if (this.mode === "live" && this.profile.trim() === "") {
      // Fail closed at construction: a live adapter with no target would
      // otherwise silently look like a refusal on every invocation.
      throw new KernelError("INVALID_SCHEMA", "live mode requires a profile", {
        mode: this.mode,
      });
    }
  }

  /** Whether this adapter instance can claim deterministic behaviour. */
  isDeterministic(): boolean {
    return this.mode === "scripted";
  }

  invoke(request: AgentInvocation):
    | { ok: true; value: AgentInvocationRecord }
    | { ok: false; error: KernelError } {
    // Input contract validation BEFORE anything else, identical to the fake
    // runtime. The host must never see a request the port would reject.
    if (request.input.objective.trim() === "") {
      return this.deny(request, new KernelError("INVALID_SCHEMA", "objective must be non-empty", {}));
    }
    if (request.attempt > request.maximumAttempts) {
      return this.deny(
        request,
        new KernelError("INVOCATION_LIMIT_EXCEEDED", "attempt exceeds maximumAttempts", {}),
      );
    }
    if (this.mode === "scripted") return this.invokeScripted(request);
    return this.invokeLive(request);
  }

  private invokeScripted(request: AgentInvocation) {
    const response = this.script[this.cursor];
    this.cursor += 1;
    if (response === undefined) {
      return this.fail(request, "RUNTIME_INFRASTRUCTURE_FAILURE", { reason: "script_exhausted" });
    }
    switch (response.kind) {
      case "success": {
        const record: AgentInvocationRecord = {
          invocationId: request.invocationId,
          outcomeClass: "success",
          artifact: response.artifact,
          detail: { artifactType: response.artifactType },
          responseFingerprint: this.fingerprint(request, response.artifact),
        };
        this.history.push({
          invocation: request,
          outcomeClass: "success",
          responseFingerprint: record.responseFingerprint,
        });
        return { ok: true as const, value: record };
      }
      case "malformed_output":
        return this.fail(request, "RUNTIME_MALFORMED_OUTPUT", response.detail);
      case "timeout":
        return this.fail(request, "RUNTIME_TIMEOUT", { timeoutMs: this.timeoutMs });
      case "refusal":
        return this.fail(request, "RUNTIME_REFUSAL", response.detail);
      case "infrastructure_failure":
        return this.fail(request, "RUNTIME_INFRASTRUCTURE_FAILURE", response.detail);
    }
  }

  /**
   * Live mode: one Hermes invocation, classified.
   *
   * The host is given the OBJECTIVE and the artifact ids, nothing else. It is
   * never given the mission id, the state version, or any authority — a host that
   * could name its own transition could walk the state machine itself.
   */
  private invokeLive(request: AgentInvocation) {
    const args = [
      "-p",
      this.profile,
      "chat",
      "-Q",
      "-q",
      this.buildHostPrompt(request),
    ];
    let result;
    try {
      result = this.run("hermes", args, this.timeoutMs);
    } catch (e) {
      return this.fail(request, "RUNTIME_INFRASTRUCTURE_FAILURE", {
        reason: "spawn_threw",
        detail: e instanceof Error ? e.name : "unknown",
      });
    }

    if (result.error) {
      // A spawn error is infrastructure, never a refusal. Conflating them would
      // let a broken host look like a policy decision.
      return this.fail(request, "RUNTIME_INFRASTRUCTURE_FAILURE", {
        reason: "spawn_error",
        detail: result.error.name,
      });
    }
    if (result.signal !== null) {
      return this.fail(request, "RUNTIME_TIMEOUT", { signal: String(result.signal) });
    }

    const stdout = (result.stdout ?? "").trim();
    const stderr = (result.stderr ?? "").trim();

    if (result.status !== 0) {
      // A non-zero exit with the host's refusal shape is a refusal; anything
      // else is infrastructure. The classification is explicit and narrow.
      const marker = matchRefusal(stdout || stderr);
      if (marker !== null) {
        return this.fail(request, "RUNTIME_REFUSAL", { marker, exitStatus: result.status ?? -1 });
      }
      return this.fail(request, "RUNTIME_INFRASTRUCTURE_FAILURE", {
        reason: "nonzero_exit",
        exitStatus: result.status ?? -1,
      });
    }

    if (stdout === "") {
      return this.fail(request, "RUNTIME_MALFORMED_OUTPUT", { reason: "empty_stdout" });
    }

    // The host answered. Its text becomes an ARTIFACT — a claim, content-addressed
    // and stored — never a verification result and never a state transition.
    const artifact: ArtifactContent = {
      fields: {
        producedBy: "hermes-adapter",
        profile: this.profile,
        capabilityId: request.capabilityId,
        objective: request.input.objective,
        outputSha256: sha256Hex(stdout),
        outputBytes: new TextEncoder().encode(stdout).length,
        // The text itself is carried, but its identity is the hash. Two hosts
        // producing the same text produce the same artifact id downstream.
        output: stdout,
      },
    };
    const record: AgentInvocationRecord = {
      invocationId: request.invocationId,
      outcomeClass: "success",
      artifact,
      detail: { artifactType: `${request.capabilityId}_output` },
      responseFingerprint: this.fingerprint(request, artifact),
    };
    this.history.push({
      invocation: request,
      outcomeClass: "success",
      responseFingerprint: record.responseFingerprint,
    });
    return { ok: true as const, value: record };
  }

  /**
   * What the host is told. Deliberately narrow: the objective and the input
   * artifact ids. No mission id, no state, no capability name that reads as an
   * instruction, no mention that an approval exists.
   */
  private buildHostPrompt(request: AgentInvocation): string {
    const ids = request.input.inputArtifactIds;
    return [
      "You are one step of a larger mission. Produce the work described below.",
      "",
      `OBJECTIVE: ${request.input.objective}`,
      ids.length > 0 ? `INPUT ARTIFACTS: ${ids.join(", ")}` : "",
      "",
      "Reply with the work itself. Do not describe a process. Do not claim that",
      "anything is verified — a different step decides that.",
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  /** Deterministic fingerprint over (invocationId, capability, objective, artifact). */
  private fingerprint(request: AgentInvocation, artifact: unknown): string {
    return sha256Hex(
      `${request.invocationId}|${request.capabilityId}|${request.input.objective}|${JSON.stringify(artifact)}`,
    );
  }

  private deny(request: AgentInvocation, error: KernelError) {
    this.history.push({
      invocation: request,
      outcomeClass: "capability_denied",
      responseFingerprint: null,
    });
    return { ok: false as const, error };
  }

  private fail(
    request: AgentInvocation,
    code: KernelErrorCode,
    detail: Record<string, string | number | boolean>,
  ) {
    const error = new KernelError(code, `host ${code.toLowerCase()}`, detail);
    this.history.push({
      invocation: request,
      outcomeClass: code.replace("RUNTIME_", "").toLowerCase() as InvocationOutcomeClass,
      responseFingerprint: null,
    });
    return { ok: false as const, error };
  }
}

/** Narrow, explicit refusal detection. Returns the matched marker or null. */
export function matchRefusal(text: string): string | null {
  if (text.trim() === "") return null;
  const low = text.toLowerCase();
  for (const marker of HOST_REFUSAL_MARKERS) {
    if (low.includes(marker.toLowerCase())) return marker;
  }
  return null;
}

function defaultRunner(
  command: string,
  args: readonly string[],
  timeoutMs: number,
): { status: number | null; stdout: string; stderr: string; signal: NodeJS.Signals | null; error?: Error } {
  const r = spawnSync(command, [...args], {
    timeout: timeoutMs,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    signal: r.signal,
    ...(r.error ? { error: r.error } : {}),
  };
}
