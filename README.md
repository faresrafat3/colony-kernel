# Colony Kernel

[![verify](https://github.com/faresrafat3/colony-kernel/actions/workflows/verify.yml/badge.svg)](https://github.com/faresrafat3/colony-kernel/actions/workflows/verify.yml) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](package.json) [![deps](https://img.shields.io/badge/runtime%20deps-0-success.svg)](package.json)

A deterministic mission-control kernel for AI-agent colonies: models propose, only the kernel commits.

**Start here if you are an agent:** [AGENTS.md](AGENTS.md) — the boot contract (one-command verify, hard rules, repo map, update-and-ship recipe).

Agents (planners, craftsmen, verifiers, reviewers) can *suggest* work; every state change, permission, budget, and human approval flows through an auditable, fail-closed core. A model saying "this passed" is never treated as a verification result.

**Status: Milestone 1A** — deterministic local core, fully offline: fake runtime, in-memory storage, injected clock/IDs. No live model, no network, no DSH import. Independent review is pending and is not claimed.

## Why

Multi-agent frameworks (orchestrators, graphs, crews) let the LLM drive workflow state — workflow only as reliable as the model. Colony inverts the trust boundary:

- **22-stage state machine**, default-deny edge table — unlisted transitions illegal.
- **Apply-once event reducer**: accepted events carry canonical hash + CAS version + monotonic sequence; replay reconstructs identical state.
- **Content-addressed approvals** (SHA-256 over RFC 8785 JCS bytes) bound to exact transition, consumed ≤1, expired at commit.
- **Budget ledger**, immutable limits + CAS rows — agents can't mint resources.
- **Deny-by-default roles** — no self-mutation/publication; reserved public states unreachable (`PUBLICATION_DISABLED`).
- **Durable rejections** — refused commands leave evidence, never mutate state.

## Commands

```
npm install
npm run typecheck   # strict TypeScript, no emit
npm run lint        # eslint (typescript-eslint flat config)
npm run test        # vitest — 66 deterministic offline tests
npm run demo        # seeded deterministic demo mission; two runs are byte-identical
```

## Layout

```
src/domain/        pure: no I/O, no platform globals, no clocks, no randomness
  mission/         22-stage enum, single-truth edge table, generated renderers
  events/          closed 40-type vocabulary, envelopes, apply-once reducer
  approvals/       content-addressed subjects, expiry-at-commit, human-authority gate
  budgets/         CAS ledger, reserve/settle/release, restricted top-ups
  artifacts/       content-addressed, immutable finalization
  capabilities/    deny-by-default role/capability registry
  canonical/       RFC 8785 JCS canonicalization
  support/         pure TypeScript SHA-256 (no node:crypto)
src/application/   ColonyKernel — command/query seam; legality precedes storage
src/ports/         colony-owned interfaces (storage, runtime, clock, ids, telemetry)
src/adapters/      in-memory storage, fake runtime, deterministic clock/ids
src/demo/          seeded deterministic demo mission
tests/             transitions / contracts / security / recovery / unit
docs/              normative spec v0.1.1 + architecture + traceability + status
reports/           Milestone 1A verification record with per-file SHA-256 manifest
```

Layering: `domain/**` imports nothing outside `domain/**`. `application` may use domain + ports. Only adapters may side-effect (in 1A they do zero I/O). Swapping the in-memory storage for a durable adapter touches no domain code.

## Honest coverage label

Everything in 1A is **simulated deterministic coverage**: fake runtime, in-memory storage, injected clocks. It is not native-runtime, isolated-runner, or live-role evidence. Deferred: durable storage adapter, tool-invocation crash matrix, migration execution, filesystem workspace isolation, DSH adapter. See `docs/IMPLEMENTATION_STATUS.md` and `docs/TEST_TRACEABILITY.md`.

## Documentation

| File | Purpose |
|---|---|
| `docs/colony-kernel-v0.1.1.md` | Normative specification (the contract) |
| `docs/ARCHITECTURE.md` | Layering rules and control flow of one command |
| `docs/IMPLEMENTATION_STATUS.md` | What is implemented vs deferred, with actual gate results |
| `docs/TEST_TRACEABILITY.md` | 66 ran tests + planned-but-not-run spec tests |
| `docs/SPEC_DEVIATIONS.md` | Scoping decisions, none normative-weakening |
| `docs/INPUT_MANIFEST.json` | SHA-256 of the normative inputs |
| `reports/MILESTONE_1A_VERIFICATION.md` | Verification record incl. self-hash manifest |

## Governance

Standing laws for contributors and agent sessions: [GOVERNANCE.md](GOVERNANCE.md) — two-copy workflow, non-negotiable gates, append-only history, read-only spec, honest labeling.

## License

MIT — see [LICENSE](LICENSE).
