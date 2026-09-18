# Changelog

All notable changes to Colony Kernel are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/), versions follow
[SemVer](https://semver.org/). The normative specification is versioned
independently (v0.1.1, hash-pinned); kernel releases do not bump it silently.

## [0.1.0] — 2026-09-18

### Added

- Deterministic mission-control core (Milestone 1A): closed 40-type event
  vocabulary, 22-stage default-deny state machine, apply-once reducer with
  CAS state versions and canonical payload hashes (RFC 8785 JCS + pure TS
  SHA-256), content-addressed approvals with expiry-at-commit and
  consumption-at-most-once, CAS budget ledger with immutable limits,
  deny-by-default roles with unreachable publication states, immutable
  content-addressed artifacts, replay-based recovery, in-memory storage,
  fake agent runtime, seeded byte-identical demo.
- 66 deterministic offline tests; zero runtime dependencies.
- `docs/`: normative spec v0.1.1 (SHA-256 pinned), architecture,
  implementation status, test traceability, spec deviations, input manifest.
- `reports/`: Milestone 1A verification record with per-file SHA-256
  manifest (self-hash verified).
- `GOVERNANCE.md`: standing laws R1–R8 (two-copy workflow, non-negotiable
  gates, append-only history, read-only spec, honest labeling, identity,
  review-before-live).
- `AGENTS.md`: agent boot contract — one-command verify, boot chain, repo
  map, determinism rules for new tests, extension seams, update-and-ship
  recipe.
- `scripts/verify.sh` + `npm run verify`: all gates in one command with a
  demo-determinism assertion.
- GitHub Actions CI (`verify.yml`): the same gates on Node 22 and 26 for
  every push and PR; external, tamper-evident health signal.

### Review hardening (pre-release, self-review)

- Enforced approval expiry at commit time (`EXPIRED_AT_COMMIT` + durable
  rejection); previously only claimed.
- Corrected C-04/C-10 to assert real refusal behavior (stage hold, no
  consumption, durable rejection) instead of passing vacuously.
- Unified canonical subject sorting on the domain tuple comparator
  (`sortArtifactSubjects`); removed the dead `purposeMatchesTransition`
  helper and an unused void-suppressed import.
- Canonicalized `docs/INPUT_MANIFEST.json` to relative paths; filled the
  implemented-tests traceability table; refreshed recorded hashes and the
  demo event-log hash with an amendment note.

### Deferred (explicitly)

- Durable storage adapter (M1B), ToolInvocation crash matrix, migration
  execution, filesystem workspace isolation, DSH adapter (M2, blocked on
  independent review).
