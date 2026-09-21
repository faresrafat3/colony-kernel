# AGENTS.md — the agent boot contract for Colony Kernel

Opening this repo? Read this file first: what is true, what is law, what is off-limits, how to change things safely.

## The one command

```
npm run verify
```

Typecheck → lint → 66 deterministic tests → demo twice (byte-identical). `verify: ALL GATES GREEN` = tree healthy. CI runs same script per push — check latest run before trusting old claims.

## The boot chain

1. **This file** — the contract.
2. [README.md](README.md) — the idea in one page.
3. [GOVERNANCE.md](GOVERNANCE.md) — **law** (R1–R8); binding.
4. [docs/colony-kernel-v0.1.1.md](docs/colony-kernel-v0.1.1.md) — normative spec, hash-pinned.
5. `docs/IMPLEMENTATION_STATUS.md` — implemented vs deferred + gate results.
6. `reports/MILESTONE_1A_VERIFICATION.md` — the evidence record.

Clash: spec > GOVERNANCE > this file > README.

## What this project is

A deterministic mission-control kernel for AI-agent colonies: models propose, only the kernel commits. State is kernel-owned: a 22-stage default-deny machine, apply-once events with CAS versions and canonical payload hashes, content-addressed approvals, a CAS budget ledger, and deny-by-default roles. Milestone 1A is offline and deterministic — fake runtime, in-memory storage, injected clocks. Detail: [README.md](README.md#why).

## Hard rules (the ones agents actually break)

1. **Never edit `docs/colony-kernel-v0.1.1.md`** — SHA-256-pinned (`docs/INPUT_MANIFEST.json`); change = ratification act (R5).
2. **Never force-push or rewrite history** on `main` (R4).
3. **Never skip `npm run verify`** before push (R3); never claim a gate you didn't run this session (R6).
4. **Commit as `faresrafat3 <faresrafat3@gmail.com>`** (R7).
5. **Live model/runtime integration blocked until independent review passes** (R8): no DSH adapter merge, no "just try it".

## Repo map

| Path | What it is | May you touch it? |
|---|---|---|
| `src/domain/**` | Pure kernel: events, state machine, approvals, budgets, roles, artifacts. No I/O, no clock, no randomness. | Yes — with tests |
| `src/application/colony-kernel.ts` | The command/query seam; legality precedes storage | Yes — with tests |
| `src/ports/**` | Colony-owned interfaces (storage, runtime, clock, ids, telemetry) — extension seams | Yes |
| `src/adapters/**` | In-memory storage, fake runtime, deterministic clock/ids | Yes |
| `src/demo/run-demo.ts` | Seeded deterministic demo; output byte-stable | Yes |
| `tests/**` | 66 deterministic tests (transitions/contracts/security/recovery/unit) | Yes — new behavior needs tests |
| `docs/colony-kernel-v0.1.1.md` | Normative spec | **No** (R5) |
| `docs/*` (status, deviations, traceability, manifest, architecture) | Truth and evidence records | Yes — keep them truthful (R6) |
| `reports/**` | Verification record + per-file SHA-256 manifest | Append/update with evidence |
| `GOVERNANCE.md` | Law | Amendment commit of its own |
| `AGENTS.md`, `README.md`, `CHANGELOG.md` | Entry surfaces | Yes |

## Determinism rules for any new test

- Injected clock + IDs only (`src/adapters/kernel-adapters.ts`): no `Date.now()`, `Math.random()`, wall-clock, network, `node:fs`.
- Domain code must never import outside `src/domain/**`.
- A test flaky on a slower machine is wrong, not unlucky.

## How to extend without breaking (the seams)

Implement a port:

- **Durable storage** → implement `ColonyStorage` (`src/ports/storage.ts`), pass to `ColonyKernel`; M1B slice, zero domain code (`docs/SPEC_DEVIATIONS.md` §5).
- **Real agent runtime** → implement `AgentRuntime` (`src/ports/agent-runtime.ts`); blocked on independent review (R8).

## The update-and-ship recipe (when your copy is old)

1. Sync: `git status` clean, `git pull --ff-only origin main`.
2. `npm ci && npm run verify`.
3. Change in lab working copy first (R1 two-copy model); copy here once its gates pass.
4. Ship: `npm run verify` → commit (what+why+evidence) → push → `git tag vX.Y.Z` → GitHub release from `CHANGELOG.md`.
5. `pull` diverges → reconcile by hand, never force (R4).

## Current milestone (2026-09-18)

M1A shipped v0.1.0: deterministic local core, zero runtime deps, 66/66 tests, byte-identical demo, CI green.
Deferred: durable storage adapter (M1B), crash matrix, migration engine, filesystem workspace isolation, DSH adapter (M2, post-review).
**Independent review PENDING, not claimed** — don't advance label until complete.
