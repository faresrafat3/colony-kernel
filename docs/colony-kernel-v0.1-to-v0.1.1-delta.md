# v0.1 → v0.1.1 — structural delta

**Scope: this is a structural delta, not a section-by-section semantic
mapping.** It states what changed in the *shape* of the normative document,
with measured facts, and it says plainly what is still missing. A semantic
mapping — which v0.1 paragraph became which v0.1.1 clause — is **not written**;
it is recorded as an open item in `docs/IMPLEMENTATION_STATUS.md` because the
two documents are organised differently enough that producing it is a mapping
exercise, not a diff.

## Measured facts

| | v0.1 | v0.1.1 |
|---|---|---|
| Path | `docs/colony-kernel-v0.1.md` | `docs/colony-kernel-v0.1.1.md` |
| SHA-256 | `ff2356e82d693229aa4509c0d1b8021d3453d0b3b3c806b78897c1d502d208a5` | `d3c8e715c09c446c2934d1177bb86b3f762e7cce055d28f0fa2739dc8b1af841` |
| Bytes | — | 43893 |
| Lines | 406 | 377 |
| Role | historical baseline | normative for new work |

Both are hash-pinned in `docs/INPUT_MANIFEST.json`, and both are read-only
(R5). A line-level diff of the two runs to 723 changed lines.

Regenerate the diff at any time:

```sh
diff -u docs/colony-kernel-v0.1.md docs/colony-kernel-v0.1.1.md
```

## The structural change

v0.1 was organised **by area**: fifteen "Implementation Decisions" sections
(scope and vocabulary, module ownership, compatibility, data contract, command
interface, state transitions, independence, human gates, durability,
dispatch and crash recovery, budgets and retries, capabilities and isolation,
role packages, prompt compiler and memory, telemetry and retention), followed
by "Testing Decisions", a delivery sequence and a completion definition.

v0.1.1 is organised **by contract**: thirteen numbered normative contracts
under a single "Normative Contracts" heading, with the testing and delivery
material folded into them.

The section list of v0.1 and the contract list of v0.1.1 are therefore **not
one-to-one**, and no line of v0.1 survives as a line of v0.1.1. This is why
the two documents are kept as separate files instead of one with a patch
applied: a diff of them is noise, and the v0.1.1 contracts are the contract.

## The v0.1.1 contracts

| Contract | Subject |
|---|---|
| N1 | Approval subject binding |
| N2 | Event envelope and apply-once semantics |
| N3 | Tool execution and crash dedupe |
| N4 | Budget ledger semantics |
| N5 | Persisted-type versioning and MigrationPolicy |
| N6 | Bounded rework and expiry races |
| N7 | ColonyStorage contract |
| N8 | Workspace and external isolation |
| N9 | DSH compatibility boundary |
| N10 | State machine |
| N11 | Four-axis evidence model (correction of review model) |
| N12 | Milestone 1 acceptance criteria (A01–A35, repaired) |
| N13 | Testing decisions |

## What v0.1.1 adds that v0.1 did not carry as a contract

Read off the two documents' own text, not inferred:

- **The 40-type closed event vocabulary** and apply-once semantics as a
  contract (N2) — v0.1 described the data contract in prose.
- **A repaired acceptance set, A01–A35** (N12). v0.1's completion definition
  was prose; v0.1.1 enumerates criteria that can be individually traced. The
  review packet's `TEST_PLAN_AUDIT.md` recorded a count mismatch between the
  planned-test enumeration (65 distinct IDs) and the verdict's cited 66 —
  `docs/SPEC_DEVIATIONS.md` §6 records that as a pre-existing packet
  observation, not an introduction.
- **A corrected evidence model** (N11 — "correction of review model").
- **The DSH compatibility boundary** (N9), with the two allowed pin paths and
  the observation that no lockfile existed. The decision record for the pin
  lives in `docs/dsh-runtime-pin-plan.md`.
- **MigrationPolicy** (N5), where v0.1 only implied versioning.
- **The tool-invocation crash-dedupe contract** (N3), which M1A implements only
  in reduced form (`docs/IMPLEMENTATION_STATUS.md`).

## What this document does not do

It does not claim that any v0.1 sentence was weakened or rewritten. That claim
is made where it can be checked — `docs/SPEC_DEVIATIONS.md`, which records the
M1A scoping decisions and states that no normative sentence of v0.1.1 was
weakened. Asserting it here without the mapping to support it would be the
kind of unbacked claim this project exists to prevent.

**Open item:** the section-by-section semantic mapping (v0.1 §* → v0.1.1
N*). It belongs to whoever ratifies the next spec version, and it should be
written before that ratification, not after.
