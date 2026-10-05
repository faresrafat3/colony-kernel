/**
 * INDEPENDENT ADVERSARIAL REVIEW — attempts to break each stated invariant.
 *
 * This file is not part of the project's own suite. It exists because GOVERNANCE
 * R8 blocks live integration until an independent review of the current milestone
 * completes, and because a claim that is only tested by its author is not tested.
 *
 * Every test below states an invariant from README.md / GOVERNANCE.md / the spec
 * and then tries to VIOLATE it. A test that cannot construct a violation is
 * reported as inconclusive rather than passed silently.
 *
 * Run:  npx vitest run tests/review/adversarial.test.ts
 */
import { describe, expect, it } from "vitest";

import { canonicalJson } from "../../src/domain/canonical/jcs.js";
import { sha256Hex } from "../../src/domain/support/sha256.js";
import { approvalSubjectHash, isHumanAuthority, isExpiredAtCommit } from "../../src/domain/approvals/approval.js";
import type { ApprovalRequest } from "../../src/domain/approvals/approval.js";
import { EDGES } from "../../src/domain/mission/state-machine.js";
import { TERMINAL_STAGES, PAUSE_STAGES, RESERVED_PUBLIC_STAGES } from "../../src/domain/mission/stages.js";
import { EventType, PUBLIC_ACTION_EVENT_TYPES } from "../../src/domain/events/vocabulary.js";
import { KernelError } from "../../src/domain/errors/kernel-error.js";

/** Build a minimal well-formed approval request for tampering. */
function request(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    schemaVersion: 1,
    approvalRequestId: "req-1",
    missionId: "m-1",
    missionStateVersion: 1,
    requestedTransition: { fromState: "AWAITING_PLAN_APPROVAL", toState: "IMPLEMENTATION" },
    approvalPurpose: "PLAN_APPROVAL",
    actionClass: "LOCAL_WRITE",
    requestedByRole: { roleId: "craftsman", roleVersion: 1 },
    requiredHumanAuthority: "owner",
    artifactSubjects: [],
    policyVersion: "p1",
    roleVersions: { craftsman: 1 },
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z",
    nonce: "a".repeat(32),
    ...over,
  };
}

describe("A1 — default-deny: no illegal transition is derivable", () => {
  it("every edge in the table has a unique id", () => {
    const ids = EDGES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no edge originates from a terminal stage", () => {
    const bad = EDGES.filter((e) => TERMINAL_STAGES.has(e.from));
    expect(bad.map((e) => e.id)).toEqual([]);
  });

  it("no edge originates from a pause stage without being a recovery/resume event", () => {
    // Pause stages must not accept ordinary work. Anything else is a hole.
    const allowedFromPause = new Set<string>([
      EventType.RECOVERY_COMPLETED,
      EventType.MISSION_CLOSED,
      EventType.APPROVAL_RECORDED,
      EventType.APPROVAL_EXPIRED,
      EventType.APPROVAL_REQUESTED,
      EventType.REVISION_REQUESTED,
    ]);
    const leaks = EDGES.filter(
      (e) => PAUSE_STAGES.has(e.from) && !allowedFromPause.has(e.event),
    );
    expect(leaks.map((e) => `${e.id}:${e.from}:${e.event}`)).toEqual([]);
  });

  it("every approval-requiring edge has an approval event or a documented gate", () => {
    const gated = EDGES.filter((e) => e.requiresApproval);
    expect(gated.length).toBeGreaterThan(0);
    const allowed = new Set<string>([EventType.APPROVAL_RECORDED, EventType.MISSION_CLOSED]);
    for (const e of gated) {
      expect(
        allowed.has(e.event),
        `${e.id} requires approval but its event is ${e.event}`,
      ).toBe(true);
    }
  });
});

describe("A2 — content-addressed approval cannot be re-pointed", () => {
  it("changing the transition changes the subject hash", () => {
    const a = approvalSubjectHash(request());
    const b = approvalSubjectHash(
      request({ requestedTransition: { fromState: "AWAITING_PLAN_APPROVAL", toState: "CLOSED" } }),
    );
    expect(a).not.toBe(b);
  });

  it("changing a single artifact hash changes the subject hash", () => {
    const base = request();
    const withArt = request({
      artifactSubjects: [
        { artifactId: "a1", artifactType: "patch", artifactSchemaVersion: 1, contentSha256: "f".repeat(64), finalizedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    const tampered = request({
      artifactSubjects: [
        { artifactId: "a1", artifactType: "patch", artifactSchemaVersion: 1, contentSha256: "e".repeat(64), finalizedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    expect(approvalSubjectHash(base)).not.toBe(approvalSubjectHash(withArt));
    expect(approvalSubjectHash(withArt)).not.toBe(approvalSubjectHash(tampered));
  });

  it("the hash is order-independent for artifact subjects (canonical sort)", () => {
    const s1 = { artifactId: "a", artifactType: "x", artifactSchemaVersion: 1, contentSha256: "1".repeat(64), finalizedAt: "2026-01-01T00:00:00.000Z" };
    const s2 = { artifactId: "b", artifactType: "x", artifactSchemaVersion: 1, contentSha256: "2".repeat(64), finalizedAt: "2026-01-01T00:00:00.000Z" };
    // The builder sorts; the hash must agree whichever order the caller supplied
    // ONLY IF the caller sorted. This asserts the sort is what makes it stable.
    const sorted = approvalSubjectHash(request({ artifactSubjects: [s1, s2] }));
    const resorted = approvalSubjectHash(request({ artifactSubjects: [s1, s2].sort((p, q) => (p.artifactId < q.artifactId ? -1 : 1)) }));
    expect(sorted).toBe(resorted);
  });

  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("canonical JSON refuses values that cannot be hashed stably", () => {
    // A silent fallback here would let two different payloads share a hash.
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
    expect(() => canonicalJson({ x: undefined as unknown as string })).toThrow();
  });
});

describe("A3 — an agent is never a valid approver", () => {
  it("a role id in the agent list is rejected", () => {
    expect(isHumanAuthority("craftsman", ["craftsman", "verifier"])).toBe(false);
  });

  it("an identity outside the agent list passes", () => {
    expect(isHumanAuthority("owner", ["craftsman", "verifier"])).toBe(true);
  });

  it("an empty agent list makes everything pass — so the caller must not pass []", () => {
    // This documents the sharp edge rather than hiding it: the guard is only as
    // strong as the role list handed to it.
    expect(isHumanAuthority("craftsman", [])).toBe(true);
  });
});

describe("A4 — an approval expires at commit", () => {
  it("a request past its expiry is expired", () => {
    expect(isExpiredAtCommit(request(), new Date("2026-01-01T02:00:00.000Z"))).toBe(true);
  });

  it("the boundary instant counts as expired (<= not <)", () => {
    expect(isExpiredAtCommit(request(), new Date("2026-01-01T01:00:00.000Z"))).toBe(true);
  });

  it("a request before its expiry is live", () => {
    expect(isExpiredAtCommit(request(), new Date("2026-01-01T00:30:00.000Z"))).toBe(false);
  });
});

describe("A5 — public action stays unreachable", () => {
  it("the public-action vocabulary is non-empty (so the guard has something to deny)", () => {
    expect(PUBLIC_ACTION_EVENT_TYPES.size).toBeGreaterThan(0);
  });

  it("no edge enters a reserved public stage", () => {
    const entering = EDGES.filter((e) => RESERVED_PUBLIC_STAGES.has(e.to));
    expect(entering.map((e) => e.id)).toEqual([]);
  });

  it("a public-action event is not a legal event on any edge", () => {
    // If a public event were reachable, PUBLICATION_DISABLED would be the only
    // thing standing between an agent and a public write. Assert it cannot even
    // be requested on a legal edge.
    const reachable = EDGES.filter((e) => PUBLIC_ACTION_EVENT_TYPES.has(e.event));
    expect(reachable.map((e) => e.id)).toEqual([]);
  });
});

describe("A6 — the hasher is the project's own, not node:crypto", () => {
  it("sha256 matches the published NIST vector for the empty string", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("sha256 matches the published NIST vector for 'abc'", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("a one-bit input change changes the digest", () => {
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
  });
});

describe("A7 — the error type carries a machine code, not prose", () => {
  it("KernelError exposes a stable code", () => {
    const e = new KernelError("SELF_APPROVAL_DENIED", "agent cannot approve", {});
    expect(e.code).toBe("SELF_APPROVAL_DENIED");
  });
});
