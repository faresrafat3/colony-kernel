# colony-kernel: Show HN / Reddit / X post

> Numbers in this post were measured on 2026-10-21: 147 deterministic tests
> (`npm run claims`), 3733 lines of TypeScript under `src/`, demo output 5613
> bytes byte-identical across runs. The independent review completed
> 2026-10-05 (`reports/INDEPENDENT_REVIEW_1A.md`).

## Hacker News (Show HN)

**Title:**
Show HN: Colony Kernel, a deterministic mission control for AI agents that stops them lying about "it passed"

**Text:**
Hi HN. I built Colony Kernel because of a problem anyone shipping AI agents
hits. You hand work to an agent, it says "I finished and the tests pass," and
you cannot verify that claim without redoing the work yourself. A model that
is confidently wrong about its own success is worse than no agent at all.

Colony inverts the trust boundary. Agents (planner, builder, verifier,
reviewer) can only *propose*; every state change, budget line, and human
approval flows through a deterministic, fail-closed kernel that decides. A
model saying "this passed" is never treated as a verification result. The
result has to be replayable evidence.

What that means concretely:

- A 22-stage state machine with a default-deny edge table. Any transition not
  explicitly listed is illegal, not "unlikely."
- Content-addressed approvals (SHA-256 over canonical bytes) bound to the exact
  transition, consumed at most once, expired at commit.
- A budget ledger with immutable limits. An agent cannot mint itself resources.
- Durable rejections. A refused command leaves evidence and never mutates
  state, so the audit trail has no gaps.
- One pinned runtime dependency (`@deepseek-ai/dsh` 0.2.1-rc.2, which no
  source file imports yet; the compatibility probe that checks it exists and
  has run against both candidate versions, 33 of 33 surfaces each),
  fully offline, and the demo mission is byte-identical across runs (replay is
  the whole point).

It is ~3.7k lines of strict TypeScript with 147 deterministic tests and a
verify gate that measures its own claims instead of trusting them.

Try to break it on the live site. The checker is projected from the kernel's
own transition table for all 22 stages: you submit a forbidden move and watch
it refuse with a reason:
https://faresrafat3.github.io/colony-kernel/

Source (MIT): https://github.com/faresrafat3/colony-kernel

Prior art, since the deterministic-kernel thesis is not new. Arbiter-K (arXiv
2604.18652, github.com/cure-lab/ArbiterOS) shipped a governance-first kernel
that turns model output into discrete instructions and intercepts unsafe
trajectories, and Rel(AI)Build (arXiv 2606.26924) built a control plane for
coding agents with SHA-256 content addressing and tiered permissions. Colony's
axis is mission control rather than security interception: budgets, approvals
bound to transitions, durable rejections.

Honest scope: Milestone 1A is a deterministic local core. Fake runtime,
in-memory storage, injected clocks. No live model, no network. The independent
review completed on 2026-10-05: Milestone 1A passed with two low-severity
findings; F1 is closed, F2 was recorded at no severity. The README says
exactly what is implemented vs deferred.

---

## Reddit (r/programming or r/MachineLearning)

**Title:** I got tired of AI agents claiming "tests pass" with no way to verify it, so I built a deterministic kernel that decides instead of the model

**Body:**
Every time I hand work to an LLM agent, I hit the same wall. "I'm done, all
tests green" is a claim I can't independently verify without doing the work
myself. A model that's wrong about its own success is actively harmful.

So I built Colony Kernel. The idea is simple. Agents propose, a deterministic
core decides. Planners, builders, verifiers, reviewers can only *suggest*
work. Every state change, budget, and approval goes through a fail-closed
kernel: a 22-stage state machine, default-deny transitions, content-addressed
approvals consumed exactly once, immutable budget limits, durable rejections
that never mutate state.

The demo is byte-identical across runs. That is the point: replay is the proof.

There's a live checker on the site where you try to break the kernel: submit a
forbidden move (skip approval, self-approve, mint budget, replay an approval,
jump to closed, reopen a closed mission) and watch it refuse with a reason.
https://faresrafat3.github.io/colony-kernel/

~3.7k lines of strict TS, one pinned dep, 147 deterministic tests. MIT.

Honest about scope: M1A is a deterministic local core, fake runtime, in-memory
storage, no live model. The independent review completed on 2026-10-05:
Milestone 1A passed with two low-severity findings; F1 is closed, F2 was
recorded at no severity.

---

## X / Twitter thread

**1/**
I got tired of AI agents saying "I finished, all tests pass", a claim I can't
verify without redoing the work.

A model that's confidently wrong about its own success is worse than no agent.

So I built a deterministic kernel that decides instead of the model. 🧵

**2/**
Agents propose. The kernel commits.

Planner, builder, verifier, reviewer can only *suggest*. Every state change,
budget, and approval flows through a fail-closed core.

"Tests passed" is never taken as proof. Proof has to be replayable evidence.

**3/**
What's inside:
• 22-stage state machine, default-deny (unlisted = illegal)
• Content-addressed approvals, consumed exactly once
• Immutable budget limits (agents can't mint resources)
• Durable rejections (audit trail has no gaps)
• 1 pinned runtime dep (no src/ import yet)

**4/**
The demo runs byte-identical every time. That's the whole point. Replay IS the
verification.

Try to break the kernel yourself (the kernel's own transition table as a live
checker):
https://faresrafat3.github.io/colony-kernel/

**5/**
Prior art: Arbiter-K (arXiv 2604.18652) intercepts unsafe trajectories;
Rel(AI)Build (arXiv 2606.26924) is a control plane for coding agents.
Colony's axis is mission control rather than security interception:
budgets, approvals bound to transitions, durable rejections.

**6/**
~3.7k lines strict TypeScript · 147 deterministic tests · MIT

Honest scope: M1A is a deterministic local core. No live model. Review
completed 2026-10-05: M1A passed with two low-severity findings; F1 closed,
F2 at no severity.

https://github.com/faresrafat3/colony-kernel
