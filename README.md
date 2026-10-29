# Colony Kernel

[![verify](https://github.com/faresrafat3/colony-kernel/actions/workflows/verify.yml/badge.svg)](https://github.com/faresrafat3/colony-kernel/actions/workflows/verify.yml) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](package.json) [![deps](https://img.shields.io/badge/runtime%20deps-1-informational.svg)](package.json)

A deterministic mission-control kernel for AI-agent colonies: models propose, only the kernel commits.

**The problem it solves.** When you hand work to an AI agent, "I finished and it works" is a *claim* you cannot verify, and a model that is wrong about its own success is worse than no agent at all. Colony makes the agent *propose* and a deterministic core *decide*, so trust comes from replayable evidence rather than the model's word.

**This is measured, not asserted.** A 2026 study of 9,876 agent trajectories (arXiv 2606.09863) found that false success, confidently reporting completion while the environment state shows otherwise, accounts for **44–52% of all failures** in single-control domains. In a dual-control domain, where an independent verifier can check state, it drops to **3%**. The mechanism is the whole argument: give the verification to something other than the model and the failure nearly disappears.

LLM judges do not close the gap. The best of five judges across five prompt strategies topped out at **AUROC 0.65**, because the surface signal false success exploits is the same signal judges use to infer completion.

**Adjacent work, named.** The deterministic-kernel argument is not new. Arbiter-K (arXiv 2604.18652, `cure-lab/ArbiterOS`) shipped a governance-first architecture around the same thesis, and Rel(AI)Build (arXiv 2606.26924) built a control plane converging on the same mechanisms: SHA-256 content addressing, phase state machines, permissions enforced before LLM invocation. Colony's axis is *mission control* (budgets, approvals bound to transitions, durable rejections) rather than security interception. Full write-up: [`docs/research-2026-10-13.md`](docs/research-2026-10-13.md).

**Live site.** [faresrafat3.github.io/colony-kernel](https://faresrafat3.github.io/colony-kernel/). It ships the recorded demo output and a live checker for six forbidden moves, so you can check the claims instead of taking my word for them. Site source lives in [`docs/site/`](docs/site/), and you can republish it anytime with `bash scripts/publish-site.sh`.

**Start here if you are an agent.** [AGENTS.md](AGENTS.md). It is the boot contract: one-command verify, hard rules, repo map, update-and-ship recipe.

Agents (planners, craftsmen, verifiers, reviewers) can *suggest* work; every state change, permission, budget, and human approval flows through an auditable, fail-closed core. A model saying "this passed" is never treated as a verification result.

**Status: Milestone 1A.** Deterministic local core, fully offline: fake runtime, in-memory storage, injected clock/IDs. No live model, no network, no DSH import. Independently reviewed on 2026-10-05: Milestone 1A passed with two low-severity findings. F1, the human-authority guard's empty-list precondition, is closed at the application layer. F2 was a recorded observation with no severity ([`reports/INDEPENDENT_REVIEW_1A.md`](reports/INDEPENDENT_REVIEW_1A.md)). That review clears the R8 precondition for *starting* Milestone 2. M2 itself is unimplemented and unreviewed.

## Why

Multi-agent frameworks (orchestrators, graphs, crews) let the LLM drive workflow state, and workflow is only as reliable as the model. Colony inverts the trust boundary:

- **22-stage state machine.** With a default-deny edge table. Unlisted transitions are illegal.
- **Apply-once event reducer.** Accepted events carry canonical hash + CAS version + monotonic sequence, and replay reconstructs identical state.
- **Content-addressed approvals.** SHA-256 over RFC 8785 JCS bytes bound to exact transition, consumed ≤1, expired at commit.
- **Budget ledger.** With immutable limits + CAS rows. Agents cannot mint resources.
- **Deny-by-default roles.** No self-mutation or publication, and reserved public states are unreachable (`PUBLICATION_DISABLED`).
- **Durable rejections.** Refused commands leave evidence and never mutate state.

## Commands

```
npm install
npm run typecheck   # strict TypeScript, no emit
npm run lint        # eslint (typescript-eslint flat config)
npm run test        # vitest — 158 deterministic offline tests
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
src/adapters/      in-memory storage, fake runtime, deterministic clock/ids,
                   Hermes host adapter (scripted default; live not wired)
src/demo/          seeded deterministic demo mission
tests/             transitions / contracts / security / recovery / unit
docs/              normative spec v0.1.1 + architecture + traceability + status
reports/           Milestone 1A verification record with per-file SHA-256 manifest
```

On layering: `domain/**` imports nothing outside `domain/**`, `application` may use domain + ports, and only adapters may side-effect (in 1A they do zero I/O). Swapping the in-memory storage for a durable adapter touches no domain code.

## Honest coverage label

Everything in 1A is **simulated deterministic coverage**: fake runtime, in-memory storage, injected clocks. It is not native-runtime, isolated-runner, or live-role evidence. A 1B `HermesAgentRuntime` proves the runtime port is host-agnostic; its scripted mode is the default and its live mode is opt-in and not wired to a runtime path. Deferred: durable storage adapter, tool-invocation crash matrix, migration execution, filesystem workspace isolation, DSH adapter. See `docs/IMPLEMENTATION_STATUS.md` and `docs/TEST_TRACEABILITY.md`.

## Documentation

| File | Purpose |
|---|---|
| `docs/colony-kernel-v0.1.1.md` | Normative specification (the contract) |
| `docs/colony-kernel-v0.1-to-v0.1.1-delta.md` | Structural delta between the two normative versions |
| `docs/ARCHITECTURE.md` | Layering rules and control flow of one command |
| `docs/IMPLEMENTATION_STATUS.md` | What is implemented vs deferred, with actual gate results |
| `docs/TEST_TRACEABILITY.md` | M1A traceability record (a snapshot; the live count is `npm test`) |
| `docs/SPEC_DEVIATIONS.md` | Scoping decisions, none normative-weakening |
| `GLOSSARY.md` | The words this project means: 52 terms, each with an Avoid list |
| `docs/adr/` | Decision records for the choices the normative spec relies on |
| `docs/dsh-runtime-pin-plan.md` | The DSH runtime pin: plan and decision record (the pin is `0.2.1-rc.2`) |
| `docs/colony-independent-review-protocol.md` | How an independent review is run and what it unlocks |
| `docs/INPUT_MANIFEST.json` | SHA-256 of the normative inputs |
| `reports/MILESTONE_1A_VERIFICATION.md` | Verification record incl. self-hash manifest |
| `reports/INDEPENDENT_REVIEW_1A.md` | The independent review of Milestone 1A (2026-10-05) |

## Governance

[GOVERNANCE.md](GOVERNANCE.md) is the standing law for contributors and agent sessions: two-copy workflow, non-negotiable gates, append-only history, read-only spec, honest labeling.

## License

MIT. See [LICENSE](LICENSE).
