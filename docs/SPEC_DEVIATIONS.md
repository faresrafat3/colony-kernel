# SPEC deviations & decisions — Milestone 1A

No normative sentence of v0.1.1 was weakened or rewritten. The items below are
M1A scoping decisions plus observations about the input packet.

## 1. Demo path continues past TECHNICAL_REVIEW (brief correction)

The mission brief's happy path ended `TECHNICAL_REVIEW -> CLOSED`. The
normative edge table has no such edge (E17 → DOCUMENTATION, E21 → FINAL_POLICY_GATE,
E23 → AWAITING_PUBLISH_APPROVAL, E26 → READY_TO_PUBLISH, E30 → CLOSED), and the
brief states the specification wins. The demo therefore traverses the full legal
path through both human gates and closes locally via E30. No reserved public
state (PUBLIC_ACTION_PENDING/PUBLISHED) is entered; public-action events fail
closed with `PUBLICATION_DISABLED`.

## 2. "Incident" events are represented by RECOVERY_STARTED/RECOVERY_COMPLETED

The audit table's E20/E33 prose names an "incident" trigger, but the closed
40-type vocabulary contains no INCIDENT_* type. M1A reading: limit exhaustion or
a blocking incident emits `RECOVERY_STARTED` (→ HUMAN_REVIEW_REQUIRED), and
`RECOVERY_COMPLETED` re-enters the recorded pre-pause stage (E34/E36), consuming
`humanResumptionCount`. Pause stages reject every other event, so no automatic
work runs while paused.

## 3. Budget events advance mission state; ledger rows are CAS-versioned beside it

`BUDGET_*` events are mission events and commit through the same atomic apply
(missionSequence + stateVersion). Ledger rows carry their own `ledgerVersion`
for compare-and-swap per `(missionId, resourceClass)` (N4 req 12). This is an
M1A structural choice, not a semantic change: `spent + reserved ≤ effectiveLimit`
holds at every commit and is asserted by tests.

## 4. Settlement does not imply release

`settle` moves value from `reserved` to `spent`; the unused remainder stays
reserved until an explicit `release` (N4 req 8 vs req 9). E-01 asserts both
steps and the resulting `remainingCapacity`.

## 5. Blob/artifact persistence is in-memory only

N7 names a SQLite-backed `CUSTOM_SQLITE_STORAGE_PLUGIN_REQUIRED`; M1A binds
`InMemoryColonyStorage` only (N7 explicitly allows this for unit tests). Atomic
event+state commit, unique constraints, immutable artifacts and leases are all
implemented and tested against that adapter; the SQLite adapter is M1B.

## 6. Packet observation: planned-test count mismatch (pre-existing, not introduced here)

`review-packet-v0.1.1/TEST_PLAN_AUDIT.md` enumerates 65 distinct IDs
(T-U01–06, T-B01–12, T-C01–08, T-D01–04, T-E01–07, T-F01–08, T-G01–08,
T-H01–03, T-I01–03, plus T-S02–S07), while the v0.1.1 verdict cites 66 tests
across series sizes that include G15. The discrepancy sits in the packet, not in
this implementation; `docs/TEST_TRACEABILITY.md` maps both the enumerated IDs and
the spec's series sizes, and the mismatch is flagged for the independent review.

## 7. Not implemented in M1A (explicit)

ToolInvocation outbox and the four-point crash matrix (N3) beyond informational
events and the RECONCILIATION_REQUIRED edge; migration execution (N5) beyond
`schemaVersion` validation and fail-closed unsupported-version errors; N8
filesystem workspace enforcement (path/traversal/symlink) which requires a real
workspace adapter; the `colony-dsh-adapter` and pin paths (N9, M2). None of
these is claimed as done anywhere in this project.