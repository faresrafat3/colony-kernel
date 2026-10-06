# Changelog

All notable changes to Colony Kernel are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/), versions follow
[SemVer](https://semver.org/). The normative specification is versioned
independently (v0.1.1, hash-pinned); kernel releases do not bump it silently.

## [Unreleased]

### Added

- `K-01` (`tests/unit/telemetry.test.ts`): asserts the per-command telemetry
  invariant. Verified to fail with the emission reverted. The test kit gained
  `toPackageGate`, the first coverage of the publish gate.
- `scripts/check-claims.mjs` (`npm run claims`, wired into `npm run verify` and
  therefore into CI): measures the test count from a vitest JSON run and refuses
  any maintained surface that states a different one — `docs/site/index.html`,
  `README.md`, `AGENTS.md`, `GOVERNANCE.md`. It also refuses a listed surface
  that has stopped stating a count, so coverage cannot disappear quietly, and
  exits 2 rather than guessing when the count cannot be measured. Verified to
  fail when a claim is drifted to 99, and when a surface drops its count.

### Changed

- Command plumbing de-duplicated: the approval-request and approval-record
  shapes now have one home each (`openApprovalRequest`, `buildApprovalRecord`);
  `createMission` no longer builds and discards two `MissionState` seeds; the
  in-memory creation seed calls the domain `initialMissionState` factory
  instead of re-spelling the state shape. Demo output is byte-identical.
- Live test counts updated 66 → 67 (`AGENTS.md`, `README.md`, `GOVERNANCE.md`,
  `docs/IMPLEMENTATION_STATUS.md`). The Milestone 1A records
  (`docs/TEST_TRACEABILITY.md`, `reports/**`) stay at 66 by design — they state
  what M1A verified. `GOVERNANCE.md` is law: this number change belongs in an
  amendment commit of its own (R-series, per the `AGENTS.md` repo map).
- Live test counts updated 67 → 117, the count the tree actually produced while
  the public surfaces still said 67. The landing page, the monitor demo and the
  profile site published "67 offline tests" for weeks; a verifier reading the
  code got 117. `AGENTS.md` no longer restates the M1A tally inline and points
  at `reports/milestone-1a-manifest.json` for it, so a record and a live claim
  cannot be confused. `GOVERNANCE.md` moves in an amendment commit of its own,
  as before.

### Fixed

- `requestPackageApproval` and `requestRevision` commit through
  `storage.atomicApply` directly and emitted no telemetry, so the publish gate
  and the revision path were unobservable — contradicting
  `docs/ARCHITECTURE.md` ("Control flow of one command" ends in "telemetry
  record"). Both now emit like every other command. Telemetry remains a derived
  view that authorizes nothing (v0.1 §15), so no gate or determinism changes.
- The landing page carried no social metadata beyond its description and no icon:
  a link pasted anywhere rendered as a bare URL. Added `og:*` and `twitter:*`
  tags with an inline SVG favicon (no extra request, no binary in the repo).
- `publish-site.sh` no longer states the test count in its own output. It used
  to carry a sixth copy of the number; it now prints what the gates measured, so
  the count has one home in each surface a reader actually meets.

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
