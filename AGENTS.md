# AGENTS.md: the agent boot contract for Colony Kernel

Opening this repo? Read this file first: what is true, what is law, what is off-limits, how to change things safely.

## The one command

```
npm run verify
```

Typecheck → lint → 147 deterministic tests → demo twice (byte-identical). `verify: ALL GATES GREEN` means the tree is healthy. CI runs the same script on every push, so check the latest run before you trust an old claim.

## The boot chain

1. This file. The contract.
2. [README.md](README.md). The idea in one page.
3. [GOVERNANCE.md](GOVERNANCE.md). The **law** (R1–R8), and it is binding.
4. [docs/colony-kernel-v0.1.1.md](docs/colony-kernel-v0.1.1.md). The normative spec, hash-pinned.
5. `docs/IMPLEMENTATION_STATUS.md`. Implemented vs deferred, plus gate results.
6. `reports/MILESTONE_1A_VERIFICATION.md`. The evidence record.

When two of them disagree, the order of authority is: spec > GOVERNANCE > this file > README.

## What this project is

A deterministic mission-control kernel for AI-agent colonies. Models propose; only the kernel commits. State is kernel-owned: a 22-stage default-deny machine, apply-once events with CAS versions and canonical payload hashes, content-addressed approvals, a CAS budget ledger, deny-by-default roles. Milestone 1A is offline and deterministic: fake runtime, in-memory storage, injected clocks. More detail: [README.md](README.md#why).

## Hard rules (the ones agents actually break)

1. Never edit `docs/colony-kernel-v0.1.1.md`. It is SHA-256-pinned (`docs/INPUT_MANIFEST.json`); a change is a ratification act (R5).
2. Never force-push or rewrite history on `main` (R4).
3. Never skip `npm run verify` before push (R3), and never claim a gate you did not run this session (R6).
4. Commit as `faresrafat3 <faresrafat3@gmail.com>` (R7).
5. **Live model/runtime integration is blocked until independent review passes** (R8): no DSH adapter merge, no "just try it".

## Repo map

| Path | What it is | May you touch it? |
|---|---|---|
| `src/domain/**` | Pure kernel: events, state machine, approvals, budgets, roles, artifacts. No I/O, no clock, no randomness. | Yes, with tests |
| `src/application/colony-kernel.ts` | The command/query seam; legality precedes storage | Yes, with tests |
| `src/ports/**` | Colony-owned interfaces (storage, runtime, clock, ids, telemetry), the extension seams | Yes |
| `src/adapters/**` | In-memory storage, fake runtime, deterministic clock/ids | Yes |
| `src/demo/run-demo.ts` | Seeded deterministic demo; output byte-stable | Yes |
| `tests/**` | 147 deterministic tests (transitions/contracts/security/recovery/unit) | Yes, with tests for new behavior |
| `docs/colony-kernel-v0.1.1.md` | Normative spec | **No** (R5) |
| `docs/*` (status, deviations, traceability, manifest, architecture) | Truth and evidence records | Yes, keep them truthful (R6) |
| `reports/**` | Verification record + per-file SHA-256 manifest | Append/update with evidence |
| `docs/site/` + `scripts/publish-site.sh` | Landing site source (loads the live demo.json it ships) + one-command publisher (R3-gated) | Yes |
| `GOVERNANCE.md` | Law | Amendment commit of its own |
| `AGENTS.md`, `README.md`, `CHANGELOG.md` | Entry surfaces | Yes |

## Determinism rules for any new test

- Injected clock and IDs only (`src/adapters/kernel-adapters.ts`): no `Date.now()`, `Math.random()`, wall-clock, network, `node:fs`.
- Domain code must never import outside `src/domain/**`.
- A test that is flaky on a slower machine is wrong, not unlucky.

## How to extend without breaking (the seams)

You extend this by implementing a port:

- **Durable storage**: implement `ColonyStorage` (`src/ports/storage.ts`) and pass it to `ColonyKernel`. That is the M1B slice: zero domain code (`docs/SPEC_DEVIATIONS.md` §5).
- **Real agent runtime**: implement `AgentRuntime` (`src/ports/agent-runtime.ts`). The M1A independent review passed, so this is unblocked for M2, but M2 needs its own review before merge.

## The update-and-ship recipe (when your copy is old)

1. Sync: `git status` clean, `git pull --ff-only origin main`.
2. `npm ci && npm run verify`.
3. Change in the lab working copy first (R1 two-copy model); copy here once its gates pass.
4. Ship: `npm run verify` → commit (what+why+evidence) → push → `git tag vX.Y.Z` → GitHub release from `CHANGELOG.md`.
5. `pull` diverges → reconcile by hand, never force (R4).

## Current milestone (2026-10-20)

M1A shipped v0.1.0: deterministic local core, zero runtime deps, byte-identical demo, CI green. The tally that release verified lives in `reports/milestone-1a-manifest.json`; the live count is `tests/**` above. HEAD now pins **one** runtime dependency (`@deepseek-ai/dsh` 0.1.1-rc.2, not yet imported by any source file; the §N9 compatibility probe now exists and has run, and its output decides the pinned version — see `docs/dsh-compatibility-evidence.md`).

Independent review completed 2026-10-05. Milestone 1A passed with two low-severity findings (`reports/INDEPENDENT_REVIEW_1A.md`). F1, the human-authority guard's empty-list precondition, is closed at the application layer. F2 was a recorded observation with no severity. R8's precondition is therefore met: M2 adapter work may start, but M2 itself is unimplemented and must come back for its own review before merge.
Deferred: durable storage adapter (M1B), crash matrix, migration engine, filesystem workspace isolation, DSH adapter (M2).
