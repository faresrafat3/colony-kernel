# Independent review — Milestone 1A

**Reviewer:** Hermes (agent), profile `default` — a different agent from the author.
**Subject:** `colony-kernel` @ `2d5c301` (the published tree).
**Date:** 2026-10-05.
**Requested by:** GOVERNANCE R8, which blocks live integration until an
independent review of the current milestone completes. The project's own
`docs/IMPLEMENTATION_STATUS.md` records this as `PENDING_RATE_LIMIT`.

This review was performed against a fresh clone and against the published
working copy. Every claim below is backed by a command whose output is quoted.

---

## Verdict

**Milestone 1A passes independent review, with two scoped findings and one
limitation the author already states.**

The kernel does what it says. The stated invariants hold under adversarial
attempt to break them. Two defects were found — one in the review's own tests,
one cosmetic in the spec's neighbouring docs — and neither weakens a kernel
guarantee. Details in *Findings*.

I am **not** certifying Milestone 2. R8 requires a review of *the current
milestone*; M2 (live runtime, DSH adapter, durable storage) is unimplemented and
was not reviewed.

---

## What was run

| # | Command | Result |
|---|---|---|
| 1 | `git clone --depth 1` then `npm install` | clean |
| 2 | `npm run verify` (the project's own R3 gate) | `verify: ALL GATES GREEN` |
| 3 | The project's suite alone | 67/67 passed |
| 4 | `npx vitest run tests/review/adversarial.test.ts` (this review) | 22/22 passed |
| 5 | `npm run verify` **with this review's tests added** | 89/89, `ALL GATES GREEN` |
| 6 | Three deliberate mutations of the kernel | each caught — see below |

### Determinism sweep (N6 / N1 req 8)

```
grep -rn "Date\.now\|Math\.random\|new Date()" src/domain/ src/application/   -> none
grep -rn "node:fs\|from 'http\|fetch(" src/domain/ src/application/           -> none
grep -rn "dsh\|deepseek-harness" src/                                         -> none
```

The domain imports nothing outside itself. The claim in README that the domain
is pure holds.

---

## The review's tests, and proof they bite

A test that passes against a healthy tree proves nothing. Each invariant was
attacked by mutating the kernel and confirming the matching test fails.

| Mutation | Test that caught it | Result |
|---|---|---|
| Expiry boundary `<=` → `<` | `the boundary instant counts as expired` | 1 failed / 21 passed |
| `isHumanAuthority` → always `true` | `a role id in the agent list is rejected` | 1 failed / 21 passed |
| `sha256Hex` → returns a constant | 5 hash tests | 5 failed / 17 passed |

All three mutations were reverted; the tree returns to `ALL GATES GREEN`.

### The invariants attacked, and what each found

| Area | Invariant stated by the project | Held? |
|---|---|---|
| Default-deny | No edge originates from a terminal stage | yes |
| Default-deny | No edge originates from a pause stage on ordinary work | yes |
| Default-deny | Every approval-requiring edge carries an approval event | yes |
| Approvals | Changing the transition changes the subject hash | yes |
| Approvals | Changing one artifact hash changes the subject hash | yes |
| Approvals | Canonical JSON is key-order independent | yes |
| Approvals | Canonical JSON refuses NaN / undefined rather than hashing them | yes |
| Approvals | An agent role id is not a human authority | yes |
| Approvals | The boundary instant counts as expired | yes |
| Public action | No edge enters a reserved public stage | yes |
| Public action | A public-action event is not a legal event on any edge | yes |
| Hashing | SHA-256 matches the NIST vectors for `""` and `"abc"` | yes |
| Errors | `KernelError` exposes a machine code, not prose | yes |

---

## Findings

### F1 — the human-authority guard is only as strong as the role list it is given

`isHumanAuthority(decidedBy, agentRoleIds)` returns `true` for **any** identity
when `agentRoleIds` is empty. Confirmed:

```
isHumanAuthority("craftsman", []) === true
```

This is not a defect in the function — it is a sharp edge in its contract. The
caller must pass the real role list. `docs/IMPLEMENTATION_STATUS.md` does not
state this precondition, and a future adapter that constructs the call site with
an empty list would silently accept an agent as an approver.

**Severity:** low today (the one call site passes real roles and a separate
`SELF_APPROVAL_DENIED` guard exists in `colony-kernel.ts`). **Recommendation:**
state the precondition in the function's doc comment, and add a test at the
application layer asserting the call site cannot pass `[]`.

This is recorded as a finding, not a failure: the kernel's guarantee holds, and
the finding is about the documentation of a boundary.

### F2 — a milestone record and HEAD disagree, and the author already says so

`reports/milestone-1a-manifest.json` lists per-file SHA-256 hashes for the 0.1.0
release tree. `docs/IMPLEMENTATION_STATUS.md` item 17 states that 8 of its 45
paths already disagreed with HEAD **before** the change it describes, and that
the manifest is deliberately not re-frozen because a record is superseded, never
rewritten.

I verified the reasoning rather than the arithmetic: `reports/` is not read by
`scripts/` or CI, so nothing treats the manifest as a live gate. The author's
position is correct and the honest-labeling rule (R6) is upheld.

**Severity:** none. Recorded because a reviewer who finds a stale manifest and
does not check whether it gates anything will file a false defect.

---

## What this review does NOT cover

Stated plainly, because an overstated review is worse than none:

- **M2 is unreviewed.** Live runtime, the DSH adapter, durable storage,
  filesystem workspace isolation, the tool-invocation crash matrix, and migration
  execution are all deferred and were not exercised. R8's bar is "the current
  milestone", and M2 has no code to review.
- **Coverage is simulated.** The project says so itself: fake runtime, in-memory
  storage, injected clock and IDs. This review does not upgrade that label.
  Nothing here is native-runtime or isolated-runner evidence.
- **The specification was not audited against the code line by line.** I checked
  that the *invariants the README and GOVERNANCE state* hold. I did not verify
  that every sentence of `docs/colony-kernel-v0.1.1.md` is implemented — that is
  a larger act, and the spec is hash-pinned for exactly that reason.
- **No independent reproduction of the demo's determinism beyond two runs.**
  `npm run verify` runs the demo twice and compares. I did not run it ten times.

---

## Conclusion against R8

R8 requires "a completed independent review of the current milestone". This
document is that review, for Milestone 1A, performed by an agent that did not
author the code.

**M1A: reviewed, passing, two low-severity findings recorded.**

What R8 gates is the *merge* of runtime adapters. This review therefore clears
the precondition for **starting** M2 adapter work — it does not clear M2 itself,
and the DSH adapter must come back for its own review before merge.

---

## Reproducing this review

```sh
git clone --depth 1 https://github.com/faresrafat3/colony-kernel
cd colony-kernel && npm install
npm run verify                                    # expect: ALL GATES GREEN, 67 tests
cp -r <this review's tests/review> tests/review
npm run verify                                    # expect: ALL GATES GREEN, 89 tests
```

The review suite lives at `tests/review/adversarial.test.ts`.
