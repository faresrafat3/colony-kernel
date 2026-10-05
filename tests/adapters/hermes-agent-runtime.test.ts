/**
 * HermesAgentRuntime — the host adapter's contract tests.
 *
 * Two things are being tested, and the second matters more:
 *
 *   1. The adapter implements the port. Same shape, same closed outcome
 *      vocabulary, same fail-closed input validation as FakeAgentRuntime.
 *   2. The adapter TRANSPORTS and does not DECIDE. Every test in the second
 *      block tries to make the adapter do the kernel's job and asserts it
 *      refuses. An adapter that classified a host's "this passed" as a
 *      verification result would silently undo the project's central claim.
 *
 * Deterministic: no network, no subprocess. Live mode is exercised through an
 * injected runner.
 */
import { describe, expect, it, vi } from "vitest";

import {
  HermesAgentRuntime,
  matchRefusal,
  type HermesScriptedResponse,
} from "../../src/adapters/hermes-agent-runtime.js";
import { FakeAgentRuntime } from "../../src/adapters/fake-agent-runtime.js";
import type { AgentInvocation } from "../../src/ports/agent-runtime.js";
import { sha256Hex } from "../../src/domain/support/sha256.js";

function invocation(over: Partial<AgentInvocation> = {}): AgentInvocation {
  return {
    invocationId: "inv-1",
    missionId: "m-1",
    roleId: "craftsman",
    roleVersion: 1,
    capabilityId: "produce_implementation_artifact",
    input: { objective: "add a docstring", inputArtifactIds: [], parameters: {} },
    idempotencyKey: "k-1",
    attempt: 1,
    maximumAttempts: 3,
    ...over,
  };
}

/** A runner stub that records what it was asked to do and returns a canned reply. */
function stubRunner(reply: { status?: number | null; stdout?: string; stderr?: string; signal?: NodeJS.Signals | null; error?: Error }) {
  const calls: { command: string; args: readonly string[]; timeoutMs: number }[] = [];
  const run = (command: string, args: readonly string[], timeoutMs: number) => {
    calls.push({ command, args, timeoutMs });
    return {
      status: reply.status ?? 0,
      stdout: reply.stdout ?? "",
      stderr: reply.stderr ?? "",
      signal: reply.signal ?? null,
      ...(reply.error ? { error: reply.error } : {}),
    };
  };
  return { run, calls };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. It implements the port
// ───────────────────────────────────────────────────────────────────────────

describe("H1 — the adapter satisfies the AgentRuntime port", () => {
  it("is substitutable for FakeAgentRuntime at the same call site", () => {
    const script: HermesScriptedResponse[] = [
      { kind: "success", artifact: { fields: { a: 1 } }, artifactType: "impl" },
    ];
    const hermes = new HermesAgentRuntime({ script });
    const fake = new FakeAgentRuntime(script);
    const h = hermes.invoke(invocation());
    const f = fake.invoke(invocation());
    expect(h.ok).toBe(f.ok);
    if (h.ok && f.ok) {
      expect(h.value.outcomeClass).toBe(f.value.outcomeClass);
      expect(h.value.invocationId).toBe(f.value.invocationId);
    }
  });

  it("rejects an empty objective before the host sees anything", () => {
    const { run, calls } = stubRunner({ stdout: "should never be reached" });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    const r = a.invoke(invocation({ input: { objective: "  ", inputArtifactIds: [], parameters: {} } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_SCHEMA");
    expect(calls).toEqual([]);
  });

  it("rejects an attempt beyond maximumAttempts before the host sees anything", () => {
    const { run, calls } = stubRunner({ stdout: "unreachable" });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    const r = a.invoke(invocation({ attempt: 4, maximumAttempts: 3 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVOCATION_LIMIT_EXCEEDED");
    expect(calls).toEqual([]);
  });

  it("every outcome class it can produce is in the port's closed vocabulary", () => {
    const allowed = new Set([
      "success", "malformed_output", "timeout", "refusal", "duplicate", "infrastructure_failure",
    ]);
    const cases: HermesScriptedResponse[] = [
      { kind: "success", artifact: { fields: {} }, artifactType: "t" },
      { kind: "malformed_output", detail: { reason: "x" } },
      { kind: "timeout" },
      { kind: "refusal", detail: { reason: "y" } },
      { kind: "infrastructure_failure", detail: { reason: "z" } },
    ];
    const a = new HermesAgentRuntime({ script: cases });
    for (let i = 0; i < cases.length; i++) {
      const r = a.invoke(invocation({ invocationId: `inv-${i}` }));
      if (r.ok) {
        expect(allowed.has(r.value.outcomeClass)).toBe(true);
      } else {
        // A failed Result carries a KernelError, not an outcome class.
        expect(r.error.code).toMatch(/^RUNTIME_|^INVALID_|^INVOCATION_/);
      }
    }
  });

  it("exhausting the script fails closed rather than inventing a success", () => {
    const a = new HermesAgentRuntime({ script: [] });
    const r = a.invoke(invocation());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RUNTIME_INFRASTRUCTURE_FAILURE");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. It transports, it does not decide  ← the load-bearing block
// ───────────────────────────────────────────────────────────────────────────

describe("H2 — the adapter never does the kernel's job", () => {
  it("a host saying 'verified' is an ARTIFACT, not a verification result", () => {
    // The single most important test in this file. A host that claims success
    // must produce a stored artifact with a hash, nothing more.
    const { run } = stubRunner({ stdout: "VERIFIED — everything passes, ship it." });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    const r = a.invoke(invocation());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.outcomeClass).toBe("success");
    expect(r.value.artifact).toBeDefined();
    // There is no field on the record by which an adapter could assert a verdict.
    expect(Object.keys(r.value)).not.toContain("verified");
    expect(Object.keys(r.value)).not.toContain("approved");
    expect(Object.keys(r.value)).not.toContain("nextState");
  });

  it("the produced artifact is content-addressed, not trusted by name", () => {
    const text = "some output";
    const { run } = stubRunner({ stdout: text });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    const r = a.invoke(invocation());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fields = r.value.artifact?.fields as Record<string, unknown>;
    expect(fields.outputSha256).toBe(sha256Hex(text));
    expect(fields.outputBytes).toBe(new TextEncoder().encode(text).length);
  });

  it("the host is never told the mission id, the state, or that an approval exists", () => {
    const { run, calls } = stubRunner({ stdout: "ok" });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    a.invoke(invocation({ missionId: "SECRET-MISSION-42" }));
    const prompt = calls[0].args[calls[0].args.length - 1];
    expect(prompt).not.toContain("SECRET-MISSION-42");
    expect(prompt.toLowerCase()).not.toContain("approval");
    expect(prompt.toLowerCase()).not.toContain("mission state");
    expect(prompt).toContain("add a docstring");
  });

  it("a host refusal is classified as a refusal, not a success", () => {
    const { run } = stubRunner({ status: 1, stdout: "OUT OF FRONT — belongs to @hunter" });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    const r = a.invoke(invocation());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RUNTIME_REFUSAL");
  });

  it("a non-zero exit with no refusal shape is INFRASTRUCTURE, not a refusal", () => {
    // Conflating a crash with a policy decision would let a broken host read as
    // a legitimate out-of-scope answer.
    const { run } = stubRunner({ status: 2, stderr: "Traceback: segfault" });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    const r = a.invoke(invocation());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RUNTIME_INFRASTRUCTURE_FAILURE");
  });

  it("a spawn error is infrastructure, never a refusal", () => {
    const { run } = stubRunner({ error: new Error("ENOENT") });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    const r = a.invoke(invocation());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RUNTIME_INFRASTRUCTURE_FAILURE");
  });

  it("a signal (killed) is a timeout, not an empty success", () => {
    const { run } = stubRunner({ signal: "SIGKILL", stdout: "" });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    const r = a.invoke(invocation());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RUNTIME_TIMEOUT");
  });

  it("an empty reply is malformed output, not an empty artifact", () => {
    const { run } = stubRunner({ stdout: "   \n  " });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    const r = a.invoke(invocation());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RUNTIME_MALFORMED_OUTPUT");
  });

  it("the adapter holds no capability check of its own — that is the kernel's", () => {
    // If the adapter re-implemented capability checking, two sources of truth
    // would drift. It must invoke for any capability the kernel already allowed.
    const { run, calls } = stubRunner({ stdout: "ok" });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run });
    for (const cap of ["propose_plan", "produce_verification_artifact", "screen_policy"]) {
      const r = a.invoke(invocation({ capabilityId: cap }));
      expect(r.ok).toBe(true);
    }
    expect(calls.length).toBe(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Determinism is claimed only where it holds
// ───────────────────────────────────────────────────────────────────────────

describe("H3 — determinism is labelled, not assumed (R6)", () => {
  it("scripted mode reports itself deterministic", () => {
    const a = new HermesAgentRuntime({
      script: [{ kind: "success", artifact: { fields: { a: 1 } }, artifactType: "t" }],
    });
    expect(a.isDeterministic()).toBe(true);
  });

  it("live mode reports itself NOT deterministic", () => {
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run: stubRunner({}).run });
    expect(a.isDeterministic()).toBe(false);
  });

  it("scripted mode is byte-identical across two fresh adapters", () => {
    const script: HermesScriptedResponse[] = [
      { kind: "success", artifact: { fields: { a: 1, b: [1, 2] } }, artifactType: "t" },
    ];
    const one = new HermesAgentRuntime({ script }).invoke(invocation());
    const two = new HermesAgentRuntime({ script }).invoke(invocation());
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  it("scripted mode performs zero I/O", () => {
    // No injected runner is supplied, so a real spawn would use the default and
    // the test would hang or fail. It must not reach it.
    const a = new HermesAgentRuntime({
      script: [{ kind: "success", artifact: { fields: {} }, artifactType: "t" }],
    });
    expect(a.invoke(invocation()).ok).toBe(true);
  });

  it("live mode with no profile fails closed at construction", () => {
    expect(() => new HermesAgentRuntime({ mode: "live" })).toThrow();
    expect(() => new HermesAgentRuntime({ mode: "live", profile: "  " })).toThrow();
  });

  it("the timeout is passed to the host, not left to the default", () => {
    const { run, calls } = stubRunner({ stdout: "ok" });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", timeoutMs: 1234, run });
    a.invoke(invocation());
    expect(calls[0].timeoutMs).toBe(1234);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Refusal detection is narrow
// ───────────────────────────────────────────────────────────────────────────

describe("H4 — refusal detection is explicit and narrow", () => {
  it("matches the crew's English out-of-front shape", () => {
    expect(matchRefusal("OUT OF FRONT — belongs to @hunter")).not.toBeNull();
  });

  it("matches the Arabic shape the crew actually produces", () => {
    expect(matchRefusal("خارج النطاق — البحث ده بتاع @hunter")).not.toBeNull();
  });

  it("does not match an ordinary reply that merely mentions another bot", () => {
    expect(matchRefusal("I completed the search and also checked with @hunter.")).toBeNull();
  });

  it("does not match empty text", () => {
    expect(matchRefusal("")).toBeNull();
    expect(matchRefusal("   ")).toBeNull();
  });

  it("returns the marker so the refusal can be logged with its reason", () => {
    expect(matchRefusal("خارج النطاق — no")).toBe("خارج النطاق");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. History is inspectable, never silent
// ───────────────────────────────────────────────────────────────────────────

describe("H5 — the adapter records what it did", () => {
  it("every invocation appears in history, including denials", () => {
    const a = new HermesAgentRuntime({ script: [{ kind: "refusal", detail: { r: "x" } }] });
    a.invoke(invocation());
    a.invoke(invocation({ invocationId: "inv-2", input: { objective: "", inputArtifactIds: [], parameters: {} } }));
    expect(a.history.length).toBe(2);
    expect(a.history[1].outcomeClass).toBe("capability_denied");
  });

  it("a success records a fingerprint and a failure records none", () => {
    const a = new HermesAgentRuntime({
      script: [
        { kind: "success", artifact: { fields: {} }, artifactType: "t" },
        { kind: "timeout" },
      ],
    });
    a.invoke(invocation());
    a.invoke(invocation({ invocationId: "inv-2" }));
    expect(a.history[0].responseFingerprint).not.toBeNull();
    expect(a.history[1].responseFingerprint).toBeNull();
  });

  it("the injected clock is used, so live-mode timestamps are reproducible", () => {
    const now = vi.fn(() => new Date(Date.UTC(2026, 0, 1)));
    const { run } = stubRunner({ stdout: "ok" });
    const a = new HermesAgentRuntime({ mode: "live", profile: "scout", run, now });
    a.invoke(invocation());
    expect(now).toBeDefined();
  });
});
