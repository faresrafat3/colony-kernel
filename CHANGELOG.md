# Changelog

All notable changes to Colony Kernel are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/), versions follow
[SemVer](https://semver.org/). The normative specification is versioned
independently (v0.1.1, hash-pinned); kernel releases do not bump it silently.

## [Unreleased]

### Fixed

- Application-seam guards (audit 2026-10-29). An approval now authorizes only
  the gate it was issued for: purpose, from-state and the request's state
  version are checked at decision time, so a pending plan request can no longer
  open the publish gate. Gate requests must name the mission's own finalized
  artifacts (the bound plan; the bound candidate and verification), a reissued
  gate makes the earlier request stale, and an expired approval is refused on
  replay as well as on first commit. The approver deny-list now comes from the
  injected role registry (`roleIds()`), so a custom registry cannot smuggle an
  agent past the human gate. A role can finalize only the artifact types its
  capabilities produce. Top-up amounts must be positive integers and the ledger
  invariants are asserted on every top-up. Tests 150 → 157.
- Storage leases honor their TTL: an expired lease no longer blocks the name,
  and an unparseable `expiresAt` is refused at acquisition. The in-memory
  adapter takes the injected clock (N6/N7), so lease time is never ambient.
  Tests 157 → 158.
- Storage leases can be renewed: `renewLease(name, ttl)` extends a live lease
  and refuses an absent or expired one with `LEASE_NOT_HELD`, so a long writer
  no longer has to release and re-acquire. Tests 158 → 159.
- `reserveMissionSequence` now hands out distinct, monotone values per mission
  instead of repeating the state's next sequence; the allocator sits outside
  the `atomicApply` snapshot, so a failed transaction cannot reissue a number.
  Tests 159 → 160.
- `compareAndSwapMissionState` now takes the events it commits (N7): the state
  swap and the event append are one operation, a batch that disagrees with the
  next state is refused with no writes, and the append constraints live in one
  helper shared with `appendEvent`. Tests 160 → 161.
- An expired gate now pauses the mission (E13/E29): the refusal is recorded
  first, then a durable `APPROVAL_EXPIRED` event moves it to
  `HUMAN_REVIEW_REQUIRED`, and a human resume re-enters the gate for a bounded
  reissue. Tests 161 → 162.
- Top-up approvals bind their terms: `requestBudgetTopUp` records the class and
  amount inside the content-addressed request, and `applyBudgetTopUp` refuses a
  different class/amount (`INVALID_PURPOSE`), a mutated request
  (`STALE_APPROVAL`) or an expired one (`EXPIRED_AT_COMMIT`). The optional
  field is documented in `docs/SPEC_DEVIATIONS.md` §8. Tests 162 → 165.
- The kernel's storage handle is private: a host keeps the instance it injected
  for reads, but the kernel no longer exposes raw writers (`appendEvent`,
  `recordApprovalDecision`, `createApprovalRequest`) to every holder. Stored
  approval requests are immutable: a duplicate id with different bytes is
  `APPROVAL_CONFLICT`, identical bytes are an idempotent replay. Tests
  165 → 166.
- Canonical JSON sorts object keys by UTF-16 code units, as RFC 8785 requires:
  the previous code-point comparator ordered astral characters (emoji) wrongly,
  so a payload or artifact with such a key hashed differently from a conforming
  JCS implementation. Tests 166 → 167.
- Live host output is redacted before it becomes an artifact (N8 req 13): a
  default pattern list covers PEM private-key blocks (a truncated header
  redacts to the end), AWS/GitHub/Anthropic/Slack/Google token shapes and
  `client_secret` assignments, with an optional `secretPatterns` override. The
  recorded hash and byte count describe the redacted text. Tests 167 → 169.

### Added

- `docs/dsh-runtime-pin-plan.md`: the plan and decision record the normative
  specification points at (v0.1.1 §N9). Records the runtime observed on the
  host on 2026-10-20 (`@deepseek-ai/dsh` **0.2.0-rc.2**, nvm-managed) against
  the version the spec recorded (`0.1.1-rc.2`), states PATH A as the decision,
  and says what executing it would have to produce. The pin itself is still
  unestablished — the document does not claim one.
- `docs/colony-independent-review-protocol.md`: the procedure GOVERNANCE R8
  refers to, written from the M1A review that was actually executed
  (`reports/INDEPENDENT_REVIEW_1A.md`). The pre-agreed protocol was never
  committed, so the document says so rather than pretending to be it.
- `docs/colony-kernel-v0.1-to-v0.1.1-delta.md`: the structural delta between
  the two normative versions, with the measured hashes and the regeneration
  command. It is explicitly **not** a section-by-section semantic mapping —
  that mapping is still unwritten and is recorded as an open item.
- `tests/security/human-authority-precondition.test.ts`: pins the
  human-authority precondition at the application layer (review finding F1).
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
- `docs/dsh-compatibility-evidence.md`: the evidence artifact for the DSH pin.
  PATH A was executed in a worktree and merged: `package.json` now pins
  `@deepseek-ai/dsh` at exactly `0.1.1-rc.2` (lockfile sha256
  `5a490581d574512c3136ec984460e1e365b01dc27b70e855679bb54ce48e749c`),
  `npm run verify` is green before and after the pin (135 tests, byte-identical
  demo, 5613 bytes), and no gate was changed, weakened or skipped. The file
  records the version drift (spec `0.1.1-rc.2` / host `0.2.0-rc.2` / npm
  latest `0.2.1-rc.2`), and lists the items it does not close. It certifies
  nothing.
- `scripts/dsh-compat-probe.mjs`: the §N9 **startup compatibility probe**, which
  did not exist before this change. It checks 33 required DSH surfaces — the
  exported symbol, the Cordis service name and the wire event name behind each
  of §N9's eight Colony-owned interfaces — and it checks them the way the
  specification's requirement 4 needs: `--require` exits non-zero with a loud
  failure that **names the missing item**, and `--json` writes a receipt
  carrying the version, the hashes, every requirement with its status, the
  verdict and the timestamp. It resolves the DSH package only from the
  project's own `node_modules`: a root with no local install, or a symlink
  that escapes the project root, is a loud failure — a global install is never
  used as a fallback. The tarball integrity is re-verified from the local npm
  cache against the lockfile's recorded value; the live `npm view` comparison
  is a separate, manually run step whose output goes in the receipt, never in
  the gate.
- `tests/unit/dsh-compat-probe.test.ts`: 12 tests for that probe. Trip cases
  for a missing symbol, a missing service and a missing event — each must fail
  **and name** the missing item; an allow case; three no-global-fallback
  cases; and a source assertion that the gate path imports no http/net/dns
  module and calls no `fetch`, `Date.now` or `Math.random`. No network, no
  wall clock: the receipt's timestamp is injected.
- `reports/dsh-compat-probe-0.1.1-rc.2-pinned.json` and
  `reports/dsh-compat-probe-0.2.1-rc.2-host.json`: the probe's receipts, one
  per version, each recording the command that produced it and its exit
  status. Both exit `0` with 33/33 surfaces passing. **No required capability
  is missing in either version.**

### Changed

- The DSH **runtime table** in `docs/dsh-runtime-pin-plan.md` was stale, and
  the correction is a measurement, not an opinion. The host was restarted at
  17:29 on 2026-10-20 and now runs `@deepseek-ai/dsh` **0.2.1-rc.2** on Node
  v26.12.0; the table said `0.2.0-rc.2` on Node v26.8.2, measured at 05:50
  the same morning. The old install is still on disk — it is simply not the
  one running. The table now carries the re-measured values, the running
  process (pid 19488), and the entry-point hash.
- The pin's **version is decided by the probe's output**: it moves forward
  from `0.1.1-rc.2` to `0.2.1-rc.2`, the version the host runs, by the rule
  this repository had already written down (probe the host's version; if the
  probe passes, the pin moves forward explicitly, with the probe output as
  the evidence). Both versions pass 33/33, so there is no missing capability
  to record; the change is in its own commit, with the reason. The pin is
  written by `--save-exact` as the literal `0.2.1-rc.2`; the lockfile now
  hashes to `1dae9830c15065b73dc06409175ddf0abf88f1f458946025285d6773fe0772fc`
  (the `0.1.1-rc.2` lockfile hashed to `5a490581…`) and records the tarball's
  SHA-512 integrity, which the probe re-verifies from the local npm cache. A
  third receipt, `reports/dsh-compat-probe-0.2.1-rc.2-pinned.json`, is the probe
  run against the install this repository now pins: 33/33, exit 0, no global
  fallback.
- A **structural difference between the two DSH versions** is now on the record,
  measured by installing each version into its own directory: `0.1.1-rc.2` ships a
  generated `lib/invariant.js` in 225 packages, carrying the scoped-event
  routing-subject table; `0.2.1-rc.2` ships none of them, and the identifier
  `scopedSubjectResolvers` appears nowhere in its tree. The `dsh-scope` public
  exports are unchanged, so all 33 probed surfaces still pass — but the probe
  checks that an event *name* is declared, not how a scoped event is routed,
  and §N9's event-translation requirements (7 and 8) are adapter-side work that
  must be built against the version the adapter will run under. Recorded as a
  finding; no requirement was weakened to accommodate it.
- Live test counts updated 135 → 147 (`README.md`, `AGENTS.md`, `GOVERNANCE.md`,
  `docs/site/index.html`, `docs/IMPLEMENTATION_STATUS.md`). The claim gate
  refuses any surface that states a different count than the tree produces,
  so the four surfaces move together.
- The runtime-dependency claim is one fact in one place. `package.json` pins
  `@deepseek-ai/dsh` at exactly `0.1.1-rc.2`, so "zero runtime dependencies"
  became false on five surfaces (`AGENTS.md`, `docs/IMPLEMENTATION_STATUS.md`,
  `docs/site/index.html`, `docs/distribution-post.md`); each now states one
  pinned dependency that no source file imports yet, and
  `docs/INPUT_MANIFEST.json` carries the handoff's measured hash and size
  (both of its byte counts were stale from creation). The M1A records
  (`reports/**`) still say "none" by design — they state what M1A verified.
- `docs/distribution-post.md` said 121 tests and "independent review pending";
  both were stale (the gate measures 135, and the review completed
  2026-10-05). The post now states the measured numbers and the review's date.
- The human-authority guard no longer depends on a hand-maintained list. The
  application layer's `AGENT_ROLE_IDS` literal is gone; the list is derived
  from the role registry's own manifests (`AGENT_ROLE_IDS` in
  `src/domain/capabilities/registry.ts`), so it cannot drift from the roles the
  kernel knows, and it cannot be empty.
- The status surfaces state the independent review as **completed (2026-10-05)**
  instead of pending. It had been done for fifteen days while `README.md` and
  `AGENTS.md` still said it was pending — a false claim on the two surfaces a
  reader meets first.
- Live test counts updated 130 → 135 (`README.md`, `AGENTS.md`, `GOVERNANCE.md`,
  `docs/site/index.html`). The claim gate refuses any surface that states a
  different count than the tree produces, so the four surfaces move together.
- `docs/ARCHITECTURE.md` pointed at the state-machine module without the `src/`
  prefix — a path that does not exist.

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

- Budget and gate rows were written outside the event's transaction. On an
  ABORTED mission `reserveBudget` returned `ILLEGAL_TRANSITION` while the ledger
  kept the reservation (`reserved=10`, `ledgerVersion=1`) and the event log held
  no `BUDGET_RESERVED`; `settle` and `release` shared the shape, and
  `applyBudgetTopUp` consumed the approval before a commit that could still
  fail. `requestPlanApproval` and `requestPackageApproval` wrote the request row
  *after* the commit, so a failure between the two left a gate nobody could
  answer. `atomicApply` now takes an `effects` callback that stages those rows
  in the same transaction; a throw rolls back events, state and rows together.
  Audit facts (approval records, rejections, finalized artifacts) stay outside
  on purpose: they must survive a refusal (C-04, C-10, A04, H-03).
  Pinned by `tests/contracts/atomic-effects.test.ts`.
- Review finding **F1** (`reports/INDEPENDENT_REVIEW_1A.md`) closed at the
  application layer. `isHumanAuthority(decidedBy, [])` returns `true` for every
  identity, so a call site passing an empty list would accept an agent as the
  approver. The precondition is now stated in the domain function's doc
  comment, `RoleRegistry` refuses to be constructed without roles
  (`INTEGRITY_FAILURE`) so an empty list is unreachable by construction, and
  the guard's list is derived from the registry's own manifests rather than a
  second hand-maintained literal. The new test was verified to fail when the
  call site is mutated to pass `[]`.
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
