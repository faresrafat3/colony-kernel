# Colony Kernel v0.1.1 — Milestone 1A, hardened

**Released:** 2026-10-13
**Since:** v0.1.0 (2026-09-18) — 16 commits, 104 → 121 tests

Milestone 1A ships as before: a deterministic local core — fake runtime,
in-memory storage, injected clocks. No live model, no network. What changed is
that it is now adversarially reviewed, and the repo says so out loud.

---

## Security: three holes found and closed

An independent review pass produced 22 adversarial tests and found three real
holes in the approval layer. Each was reproduced behaviourally against the real
kernel, fixed, pinned with a regression test, then re-run to confirm it no
longer reproduces.

| # | Hole | What it allowed | Fix |
|---|---|---|---|
| **R1** (critical) | `recordApprovalDecision` never re-bound the subject hash at consumption | A request mutated *after* the record was built still authorized the commit | The live subject hash is recomputed and compared before commit; a mismatch refuses `STALE_APPROVAL`. Checked before the idempotent-replay early-return, so a stale approval cannot be replayed as valid |
| **R2** | The "test/audit seam" (`recordApprovalDecisionRaw`) carried no authority guard | An agent role could self-approve — and `applyBudgetTopUp` consumes its output | Same `isHumanAuthority` guard as the guarded path, on every public route |
| **R3** | `applyBudgetTopUp` checked only that a record was `APPROVED`, never consuming it | One `APPROVED` record could raise the budget limit repeatedly | `consumeApproval` runs **before** any ledger mutation — refusing first, mutating second. A reused record is refused `APPROVAL_ALREADY_CONSUMED` and the limit does not move |

The ordering bug in R3 is the interesting one: `consumeApproval` originally ran
*after* the ledger write, so the limit changed and then the refusal arrived.
The fix moves the consumption ahead of the mutation.

Regression tests: `tests/security/approval-review-fixes.test.ts` (4 tests, one
per fix plus a no-false-positive case — an unmutated subject still commits).

---

## Second host: the port is genuinely host-agnostic

`src/adapters/hermes-agent-runtime.ts` is a real host implementation of the
`AgentRuntime` port, alongside the fake runtime. Two unrelated hosts satisfy the
same interface with the kernel's domain code untouched either way — which is the
actual test of whether `src/ports/` is a real seam or a decorative one.

The adapter **transports; it never decides.** Capability checks, stage legality,
approval requirements and artifact acceptance all remain the kernel's.

**It is written and tested (28 tests) but not wired in.** GOVERNANCE R8 defers
runtime adapters until an independent review passes, so this is parked, not
missing. M2 remains unstarted by design.

---

## The problem statement now cites measurements

The README and the site previously asserted that agent success claims are
unverifiable. They now cite the study that measures it (arXiv 2606.09863,
9,876 trajectories):

- False success — confidently reporting completion while state shows otherwise —
  is **44–52% of all failures** in single-control domains
- In a dual-control domain where an independent verifier checks state: **3%**
- Best LLM judge across 5 judges × 5 prompt strategies: **AUROC 0.65**
- 20–24% of adversarially rewritten failures fool even the good detectors —
  prose is attackable, programmatic state is not

That first pair is the argument for the whole architecture: hand verification to
something other than the model and the failure nearly disappears.

---

## Adjacent work, named

The deterministic-kernel thesis is not new, and the repo no longer implies it
is:

- **Arbiter-K** (arXiv 2604.18652, `cure-lab/ArbiterOS`) shipped a
  governance-first execution architecture around the same premise — model as a
  probabilistic unit encapsulated by a deterministic neuro-symbolic kernel —
  reporting **76–95%** unsafe interception. It is the stronger implementation
  and it came first.
- **Rel(AI)Build** (arXiv 2606.26924) proposes a deterministic control plane
  converging on the same mechanisms: SHA-256 content addressing, phase state
  machines, permissions enforced before LLM invocation — measured over 10,008
  repos / 6,145 agent config files.

Colony's axis is **mission control** — budgets, approvals bound to transitions,
durable rejections — not security interception. Scope, not novelty.

Full write-up: [`docs/research-2026-10-13.md`](docs/research-2026-10-13.md).

---

## What this release does *not* claim

- **No evaluation of our own.** Arbiter-K reports interception rates. Colony
  reports 121 deterministic tests, which prove the kernel behaves as specified —
  not that it catches false success in the wild. There is no number equivalent
  to theirs, and inventing one would be the exact failure the project is about.
- **M1A is a local core.** Fake runtime, in-memory storage, no live model. The
  verify gate's demo is byte-identical across runs because replay is the point,
  not because anything real has been measured end to end.
- **R8 keeps M2 closed.** The live integration that would make any of this
  externally measurable stays parked until an independent review passes.

## Verify it yourself

```bash
npm run verify     # 121 tests + claim surfaces + byte-identical demo replay
```

The gate measures its own claims instead of trusting them: the test count,
demo bytes and release numbers are checked across four surfaces, and a mismatch
fails the build.
