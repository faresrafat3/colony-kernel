# GOVERNANCE — standing laws for this repository

These laws bind every contributor and every agent session working on
Colony Kernel. They are process law: they do not amend the normative
specification (`docs/colony-kernel-v0.1.1.md`, hash-pinned in
`docs/INPUT_MANIFEST.json`). A clash with the spec: the spec wins.

## R1 — Two-copy workflow

- The **lab working copy** lives on the owner's machine (currently
  `~/anatomy-lab/colony-kernel`) and is not part of this repository.
- `Projects/colony-kernel` is the **published repository** (origin:
  `faresrafat3/colony-kernel`).
- Work happens in the lab copy first; the published copy receives it only
  after the gates of R3 pass.

## R2 — Sync before work

Before any change, run `git status` and `git pull --ff-only` in the copy you
touch. Another session may have advanced the work since your last read.
Dirty-tree merges are forbidden: commit or stash first.

## R3 — The gates are non-negotiable

No push without, on the exact tree being pushed:

```
npm run typecheck   # strict, zero diagnostics
npm run lint        # zero errors, zero warnings
npm run test        # 66/66 deterministic tests
npm run demo twice  # byte-identical reruns
```

## R4 — History is append-only

No force push. No history rewrite. No filter-repo on the published branch.
If history must be rewritten, it happens in a scratch clone and the result
lands as a new reviewed state, never as a destructive push.

## R5 — The specification is read-only

`docs/colony-kernel-v0.1.1.md` is pinned by SHA-256. Changing it is a
separate ratification act: draft, hash, update the manifest, and state the
amendment in a commit of its own. Code never drifts from the spec silently.

## R6 — Honest labeling

No simulated receipt is presented as real verification. The README status
section states the milestone, the coverage label (simulated / durable /
live) and the independent-review status exactly. Overstating a claim is a
violation equal to a broken test.

## R7 — Identity

Commits use `faresrafat3 <faresrafat3@gmail.com>`. No mixed identities on
the published branch.

## R8 — Review before live integration

Live model or runtime integration (M2 scope) requires a completed
independent review of the current milestone first, per the spec. Until that
review passes, runtime adapters stay deferred and unmerged.
