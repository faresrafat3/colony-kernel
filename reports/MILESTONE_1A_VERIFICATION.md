# Milestone 1A verification report

Scope verified: the deterministic local core built in this mission, using the
fake runtime, in-memory storage and injected clock/IDs. **No live model, DSH
runtime, network request or public action was invoked.** Independent review has
not run and is not claimed.

## Environment

- Node v26.8.2 · npm 11.19.1 · Linux 7.0.0-31-generic x86_64
- `package-lock.json` sha256 `f13a57fd571abb63434975ef53b9706413a4ad4f1b554822a29d3329a2013d93`
- Runtime dependencies: none. Dev deps pinned exactly (typescript 5.9.3, vitest 5.0.1, eslint 10.10.0, @typescript-eslint 8.70.0, prettier 3.9.7, @types/node 22.20.3).

## Commands and actual results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0, no diagnostics (strict) |
| `npm run lint` | exit 0, 0 errors / 0 warnings |
| `npm run test` (run 1) | 66 passed / 66 |
| `npm run test` (run 2) | 66 passed / 66 |
| `npm run demo` (run 1) | exit 0, event-log hash `3098dcc2c7038e4309f922e5eeea75acfb2efdcdd6658bf79d703f41a39901a1` |
| `npm run demo` (run 2) | exit 0, identical bytes and identical event-log hash |

Demo output (both runs): mission `mission-0001-ada124ff`, 7 artifacts, 23 accepted
events, final stage `CLOSED`, final stateVersion 23.

**Post-1A review amendment:** the canonical subject sort was unified on the
domain tuple comparator and expiry-at-commit was enforced (`EXPIRED_AT_COMMIT`).
This changed the PLAN/PACKAGE approval subject hashes and the event-log hash
from the values first reported (demo hash was `7fcd1b71…`). The values above
are current as of the fix.

## Self-review sweeps

| Sweep | Method | Result |
|---|---|---|
| DSH imports | grep for `deepseek-ai`, `dsh-`, `@dsh` across `src`+`tests` | none |
| Network libraries / URLs | grep for `node:fs|net|http|https|child_process|crypto`, `fetch(`, `require(`, `execSync`, `spawnSync`, `http(s)://` | none (only doc comments and the G-08 test title mention them) |
| Shell/process execution | same sweep | none |
| Dependencies | `package.json` `dependencies` | `{}` |
| Sources confined | `find`/listing | all 43 source, test and doc files under `colony-kernel/` |
| Normative inputs unchanged | sha256 re-check | v0.1.1 `d3c8e715…`, handoff `ed15ef7b…`, v0.1 `ff2356e8…` — all match `docs/INPUT_MANIFEST.json` |
| Persisted types versioned | review of domain types | all 10 M1A persisted types carry `schemaVersion` |
| Public actions | code + tests | `PUBLIC_ACTION_*` fail closed with `PUBLICATION_DISABLED`; no edge enters reserved states |

## Unresolved defects in the M1A surface

None known at P0. Known limitations are functional scope, not defects, and are
listed in `docs/IMPLEMENTATION_STATUS.md` (deferred) and `docs/SPEC_DEVIATIONS.md`
(items 1–7). In particular the ToolInvocation crash matrix (N3) and migration
execution (N5) are **not implemented**, and the packet's 65-vs-66 planned-test
discrepancy is recorded, not resolved.

## Reviewer-relevant honesty notes

- Every test label describes simulated deterministic coverage only.
- The demo is a simulated mission; no simulated receipt is presented as real
  verification.
- `reports/milestone-1a-manifest.json` lists all 43 files with byte counts and
  SHA-256, plus the per-test names that actually ran.
- Independent review remains **PENDING_RATE_LIMIT**; the review workspace is
  external to this repository, was not modified, and no review was retried
  during this mission.