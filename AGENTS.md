# AGENTS.md — the agent boot contract for Colony Kernel

You are an agent (or a human acting like one) opening this repository. Read
this file first. It tells you what is true, what is law, what is off-limits,
and how to change things without breaking anything.

## The one command

```
npm run verify
```

Runs typecheck → lint → the 66 deterministic tests → the demo twice with a
byte-identical-output assertion. If this prints `verify: ALL GATES GREEN`,
the tree in front of you is healthy. CI runs the same script on every push —
check the latest run before trusting an old claim.

## The boot chain

1. **This file** — the contract.
2. [README.md](README.md) — the idea in one page.
3. [GOVERNANCE.md](GOVERNANCE.md) — **law** (R1–R8). Read it; you are bound by it.
4. [docs/colony-kernel-v0.1.1.md](docs/colony-kernel-v0.1.1.md) — the normative specification. Hash-pinned.
5. `docs/IMPLEMENTATION_STATUS.md` — what is implemented vs deferred, with real gate results.
6. `reports/MILESTONE_1A_VERIFICATION.md` — the evidence record.

Clash resolution: specification > GOVERNANCE > this file > README.

## What this project is (one paragraph)

A deterministic mission-control kernel for AI-agent colonies. Models propose;
only the kernel commits. A 22-stage default-deny state machine, an apply-once
event reducer with CAS versions and canonical payload hashes, content-addressed
human approvals, a CAS budget ledger, and a deny-by-default role registry with
unreachable publication states. Everything is offline and deterministic in
Milestone 1A: fake runtime, in-memory storage, injected clocks.

## Hard rules (the ones agents actually break)

1. **Never edit `docs/colony-kernel-v0.1.1.md`.** It is pinned by SHA-256 in
   `docs/INPUT_MANIFEST.json`. A spec change is a ratification act (R5).
2. **Never force-push or rewrite history** on `main` (R4).
3. **Never skip `npm run verify`** before a push (R3). Never claim a gate
   result you did not run in this session (R6).
4. **Commit as `faresrafat3 <faresrafat3@gmail.com>`** (R7).
5. **Live model/runtime integration is blocked until independent review
   passes** (R8). Don't merge a DSH adapter; don't "just try it".

## Repo map

| Path | What it is | May you touch it? |
|---|---|---|
| `src/domain/**` | Pure kernel: events, state machine, approvals, budgets, roles, artifacts. No I/O, no clock, no randomness. | Yes — with tests |
| `src/application/colony-kernel.ts` | The command/query seam; legality precedes storage | Yes — with tests |
| `src/ports/**` | Colony-owned interfaces (storage, runtime, clock, ids, telemetry) | Yes — these are the extension seams |
| `src/adapters/**` | In-memory storage, fake runtime, deterministic clock/ids | Yes |
| `src/demo/run-demo.ts` | Seeded deterministic demo | Yes — output must stay byte-stable |
| `tests/**` | 66 deterministic tests (transitions/contracts/security/recovery/unit) | Yes — new behavior needs new tests |
| `docs/colony-kernel-v0.1.1.md` | Normative spec | **No** (R5) |
| `docs/*` (status, deviations, traceability, manifest, architecture) | Truth and evidence records | Yes — keep them truthful (R6) |
| `reports/**` | Verification record with per-file SHA-256 manifest | Append/update with evidence only |
| `GOVERNANCE.md` | Law | Amendment commit of its own |
| `AGENTS.md`, `README.md`, `CHANGELOG.md` | Entry surfaces | Yes |

## Determinism rules for any new test

- Injected clock and IDs only (`src/adapters/kernel-adapters.ts`). No
  `Date.now()`, no `Math.random()`, no wall-clock, no network, no `node:fs`.
- Domain code must never import outside `src/domain/**`.
- If your test would be flaky on a slower machine, it is wrong, not unlucky.

## How to extend without breaking (the seams)

Implement a port:

- **Durable storage** → implement `ColonyStorage` (`src/ports/storage.ts`) and
  pass it to `ColonyKernel`. That is the M1B slice; it must touch zero domain
  code. See `docs/SPEC_DEVIATIONS.md` §5.
- **A real agent runtime** → implement `AgentRuntime`
  (`src/ports/agent-runtime.ts`). Blocked on independent review (R8).

## The update-and-ship recipe (when your copy is old)

1. `git status` must be clean; `git pull --ff-only origin main`.
2. `npm ci && npm run verify` — if green, your copy is current and healthy.
3. Make changes in the lab copy first (`~/anatomy-lab/colony-kernel`); copy
   into this repo only after the gates pass there (R1).
4. Ship: `npm run verify` here → commit (message states what and why, with
   evidence) → push → `git tag vX.Y.Z` → GitHub release with notes from
   `CHANGELOG.md`.
5. If `pull` diverges: stop and reconcile by hand — never force (R4).

## Current milestone (2026-09-18)

- **M1A shipped at v0.1.0**: deterministic local core, zero runtime
  dependencies, 66/66 tests, byte-identical demo, CI green.
- **Deferred**: durable storage adapter (M1B), crash matrix, migration
  engine, filesystem workspace isolation, DSH adapter (M2, post-review).
- **Independent review: PENDING and not claimed.** Do not advance the label
  until it completes.
