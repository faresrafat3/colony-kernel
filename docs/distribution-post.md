# colony-kernel — Show HN / Reddit / X post

> Numbers in this post were measured on 2026-10-20: 135 deterministic tests
> (`npm run claims`), 3669 lines of TypeScript under `src/`, demo output 5613
> bytes byte-identical across runs. The independent review completed
> 2026-10-05 (`reports/INDEPENDENT_REVIEW_1A.md`).

## Hacker News (Show HN)

**Title:**
Show HN: Colony Kernel – deterministic mission control for AI agents that stops them lying about "it passed"

**Text:**
Hi HN. I built Colony Kernel because of a problem anyone shipping AI agents
hits: you hand work to an agent, it says "I finished and the tests pass," and
you have no way to verify that claim without redoing the work yourself. A model
that is confidently wrong about its own success is worse than no agent at all.

Colony inverts the trust boundary. Agents (planner, builder, verifier,
reviewer) can only *propose*; every state change, budget line, and human
approval flows through a deterministic, fail-closed kernel that decides. A
model saying "this passed" is never treated as a verification result — the
result has to be replayable evidence.

What that means concretely:

- A 22-stage state machine with a default-deny edge table. Any transition not
  explicitly listed is illegal, not "unlikely."
- Content-addressed approvals (SHA-256 over canonical bytes) bound to the exact
  transition, consumed at most once, expired at commit.
- A budget ledger with immutable limits — an agent cannot mint itself
  resources.
- Durable rejections — a refused command leaves evidence and never mutates
  state, so the audit trail has no gaps.
- One pinned runtime dependency (`@deepseek-ai/dsh` 0.1.1-rc.2, which no
  source file imports yet — the compatibility probe is still to be written),
  fully offline, and the demo mission is byte-identical across runs (replay is
  the whole point).

It is ~3.7k lines of strict TypeScript with 135 deterministic tests and a
verify gate that measures its own claims instead of trusting them.

Try to break it on the live site (the kernel's real transition table,
distilled into a checker where you submit a forbidden move and watch it
refuse): https://faresrafat3.github.io/colony-kernel/

Source (MIT): https://github.com/faresrafat3/colony-kernel

Honest scope: Milestone 1A is a deterministic local core — fake runtime,
in-memory storage, injected clocks. No live model, no network. Independent
review completed 2026-10-05 with two low-severity findings. The README says
exactly what is implemented vs deferred.

---

## Reddit (r/programming or r/MachineLearning)

**Title:** I got tired of AI agents claiming "tests pass" with no way to verify it, so I built a deterministic kernel that decides instead of the model

**Body:**
Every time I hand work to an LLM agent, I hit the same wall: "I'm done, all
tests green" is a claim I can't independently verify without doing the work
myself. And a model that's wrong about its own success is actively harmful.

So I built Colony Kernel. The idea is simple: agents propose, a deterministic
core decides. Planners, builders, verifiers, reviewers can only *suggest*
work. Every state change, budget, and approval goes through a fail-closed
kernel — 22-stage state machine, default-deny transitions, content-addressed
approvals consumed exactly once, immutable budget limits, durable rejections
that never mutate state.

The demo is byte-identical across runs (that's the point — replay is proof).

There's a live checker on the site where you try to break the kernel: submit a
forbidden move (skip approval, self-approve, mint budget, mutate the log) and
watch it refuse with a reason. https://faresrafat3.github.io/colony-kernel/

~3.7k lines of strict TS, one pinned dep, 135 deterministic tests. MIT.

Honest about scope: M1A is a deterministic local core, fake runtime, in-memory
storage, no live model. Independent review completed 2026-10-05.

---

## X / Twitter thread

**1/**
I got tired of AI agents saying "I finished, all tests pass" — a claim I
can't verify without redoing the work.

A model that's confidently wrong about its own success is worse than no agent.

So I built a deterministic kernel that decides instead of the model. 🧵

**2/**
The idea: agents propose, the kernel commits.

Planner, builder, verifier, reviewer can only *suggest*. Every state change,
budget, and approval flows through a fail-closed core.

"Tests passed" is never taken as proof — proof has to be replayable evidence.

**3/**
What's inside:
• 22-stage state machine, default-deny (unlisted = illegal)
• Content-addressed approvals, consumed exactly once
• Immutable budget limits (agents can't mint resources)
• Durable rejections (audit trail has no gaps)
• 1 pinned runtime dep (not yet imported)

**4/**
The demo runs byte-identical every time. That's the whole point — replay IS
the verification.

Try to break the kernel yourself (real transition table as a live checker):
https://faresrafat3.github.io/colony-kernel/

**5/**
~3.7k lines strict TypeScript · 135 deterministic tests · MIT

Honest scope: M1A is a deterministic local core (fake runtime, in-memory
storage). No live model. Independent review completed 2026-10-05.

https://github.com/faresrafat3/colony-kernel
