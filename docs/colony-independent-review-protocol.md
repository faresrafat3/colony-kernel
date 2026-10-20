# Independent review protocol

**Why this exists.** GOVERNANCE R8: *"Live model or runtime integration (M2
scope) requires a completed independent review of the current milestone
first. Until that review passes, runtime adapters stay deferred and
unmerged."* This is the procedure that decides whether a review has actually
happened, and what a pass means.

**Provenance (stated plainly).** The pre-agreed protocol was never committed to
this repository. This document was written on 2026-10-20 from the review that
was actually executed — `reports/INDEPENDENT_REVIEW_1A.md`, the M1A review of
2026-10-05 — so the procedure exists in writing rather than only in the result.
Where the M1A review did something, this document says so; where it did not,
this document does not pretend it did.

## 1. Independence

The reviewer must not be the author of the code under review. The M1A review
was performed by Hermes (agent, profile `default`), against a **fresh clone**
of the published repository — not against the author's working tree, so the
reviewer sees what a user would install.

## 2. What the reviewer runs

In order, on the exact tree being reviewed, with the real output quoted:

1. `git clone --depth 1` + `npm install` — a clean install from scratch.
2. `npm run verify` — the project's own gate (R3).
3. The project's suite alone — the count, not the summary.
4. The reviewer's **own** adversarial tests, run against the tree.
5. `npm run verify` again, with those tests added — the gate must still be
   green with the reviewer's tests in it.
6. **Deliberate mutations** of the kernel, one per invariant, each reverted —
   to prove the tests that "protect" the invariant actually fail when it is
   broken.

## 3. The rule that makes the review worth something

> A test that passes against a healthy tree proves nothing.

Every invariant the reviewer relies on must be paired with a mutation that the
matching test catches. The M1A review ran three mutations and recorded the
result of each: the expiry boundary flipped from `<=` to `<` (1 test failed),
`isHumanAuthority` forced to `true` (1 test failed), and `sha256Hex` forced to
a constant (5 tests failed). All three were reverted and the tree returned to
`ALL GATES GREEN`.

A reviewer who cannot produce a failing mutation for an invariant has not
verified that invariant; they have observed that the code is green.

## 4. What the report must contain

- **The verdict**, naming the milestone reviewed and the commit it was
  reviewed at (`colony-kernel @ <sha>`), and stating explicitly which
  milestones are *not* covered.
- **What was run** — a table of command → result, with the real outputs.
- **The invariants attacked** and whether each held.
- **The findings**, each with a severity and a recommendation. A finding is
  recorded even when it is not a defect (the M1A review recorded F2, a
  milestone-record/HEAD divergence the author had already stated, so that a
  later reader would not file it as a new defect).
- **What the review does NOT cover.** This section is mandatory and the M1A
  review's is the model: M2 unreviewed; coverage simulated, not native-runtime
  or isolated-runner evidence; the specification not audited line by line;
  determinism confirmed by two runs, not ten.

An overstated review is worse than no review: it turns R8 into a rubber stamp.

## 5. Where the result lives, and what it unlocks

The report is a record: `reports/INDEPENDENT_REVIEW_<milestone>.md` (the M1A
one is `reports/INDEPENDENT_REVIEW_1A.md`). Records are append-only in spirit
— a superseded record is superseded, never rewritten.

**A pass clears R8 for *starting* the next milestone. It does not certify the
next milestone.** The M1A review said this in its own words: it clears the
precondition for starting M2 adapter work; "the DSH adapter must come back for
its own review before merge". The same rule applies to every milestone that
follows.

## 6. The M1A review as the worked example

| # | Command | Result |
|---|---|---|
| 1 | `git clone --depth 1` then `npm install` | clean |
| 2 | `npm run verify` | `verify: ALL GATES GREEN` |
| 3 | the project's suite alone | 67/67 passed (the count at the time of the review) |
| 4 | `npx vitest run tests/review/adversarial.test.ts` | 22/22 passed |
| 5 | `npm run verify` with the review's tests added | 89/89, `ALL GATES GREEN` |
| 6 | three deliberate mutations | each caught |

Verdict: **M1A reviewed, passing, two low-severity findings recorded.**

Finding **F1** — the human-authority guard is only as strong as the role list
it is given: `isHumanAuthority(decidedBy, [])` returns `true` for every
identity. The review recorded it as a sharp edge in the contract rather than a
defect, and recommended two things: state the precondition in the function's
doc comment, and add a test at the application layer asserting the call site
cannot pass `[]`. Both were done on 2026-10-20 — see
`docs/IMPLEMENTATION_STATUS.md` item 18.

Finding **F2** — a milestone record and HEAD disagree, and the author already
says so. Severity: none. Recorded so that a reviewer who finds the stale
manifest checks whether it gates anything (it does not) before filing a false
defect.

## 7. For the next reviewer

Read this file, read `reports/INDEPENDENT_REVIEW_1A.md`, then do the M2
version of section 2. Write `reports/INDEPENDENT_REVIEW_M2.md`. Update
`docs/IMPLEMENTATION_STATUS.md` with the outcome — and update the entry
surfaces (`README.md`, `AGENTS.md`) that state the review status, because a
stale "review pending" line is a false claim the moment the review lands. The
M1A review sat done for fifteen days while `README.md` still said it was
pending; that is the failure mode this section exists to prevent.
