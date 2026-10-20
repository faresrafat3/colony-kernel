# DSH compatibility evidence

**Status: the pin is NOT established.** PATH A has been executed — the pinned
install exists, the lockfile is committed and hashed below — but two things
required by §N9 are still missing: the runtime compatibility probe, and a
ratified version choice. This file records what was measured, what was
executed, what drifted, and what remains open. It states the drift; it does
not silently repair it.

Scope: this artifact records the **runtime pin**. It is not adapter
conformance evidence, it does not certify Milestone 2, and it does not certify
that the pinned version works. No Colony code imports DSH, and no DSH code was
executed by the kernel: the pinned package was installed and inspected, not
run.

Provenance: measured on this host on **2026-10-20** (Node v26.8.2, npm
12.2.0, Linux x86_64 — the milestone-1A manifest records npm 11.19.1 for
that release, so the toolchain has moved since), on branch
`feat/dsh-evidence` in the worktree
`/home/fares/.dsh/worktrees/colony-kernel-evidence` (commit `60d52fe` carries
the pin; this file and the handoff link are the commit that follows it).
Nothing in the published checkout `/home/fares/Projects/colony-kernel` was
modified.

Normative basis: `docs/colony-kernel-v0.1.1.md` §N9 (requirements 1–4 and the
two allowed paths) and the DSH-mapping reference M08 in the same document
(N7 note). Decision record: `dsh-runtime-pin-plan.md`.

## 1. Measured facts

Every row is a command that was run, with the output it produced. None is
copied from the specification or from another document.

| Fact | Value | Command |
|---|---|---|
| DSH version the **host** runs right now | `0.2.0-rc.2` | `dsh --version` |
| `dsh` on PATH | `/home/fares/.nvm/versions/node/v26.8.2/bin/dsh` | `command -v dsh` |
| Host global install | `/home/fares/.nvm/versions/node/v26.8.2/lib/node_modules/@deepseek-ai/dsh` | `ls -d` on that path |
| Host global package version | `0.2.0-rc.2` | `node -e "console.log(require('<that path>/package.json').version)"` |
| Host global entry | `lib/bin.js` (11697 bytes) | `ls -l <that path>/lib/bin.js` |
| Latest version published on npm | `0.2.1-rc.2` | `npm view @deepseek-ai/dsh version` |
| npm dist-tags | `latest` = `0.2.1-rc.2`, `next` = `0.2.1-rc.2`, `alpha` = `0.2.1-alpha.5` | `npm view @deepseek-ai/dsh dist-tags` |
| Published versions | 36 total; `0.1.1-rc.2` **and** `0.2.0-rc.2` both still published | `npm view @deepseek-ai/dsh versions --json` |
| Tarball integrity of the pinned version | `sha512-UP1UIh6q3Gme/yXRn/QL2P8IsVlv8Shpg22TRJIZPsCRWLm4CBiA1MUvXmJAfsOEETBMLAl+xWPtFw6ICsN3wg==` | `npm view @deepseek-ai/dsh@0.1.1-rc.2 dist.integrity` |

## 2. The pin method: PATH A, executed as written

§N9 PATH A: *"create the Colony package root; `npm install --save-exact
@deepseek-ai/dsh@0.1.1-rc.2`; commit `package-lock.json`; record lockfile
SHA-256 in the adapter manifest. Runtime compatibility probe runs at startup
against this pinned install."*

The command, run in the worktree, verbatim:

```
npm install --save-exact @deepseek-ai/dsh@0.1.1-rc.2
```

Result (real output): `added 441 packages, and audited 574 packages in 16m`,
exit status `0`.

| Fact | Value | Source |
|---|---|---|
| Pin method | **PATH A** (project-local exact install) | §N9; the command above |
| Declared dependency | `"@deepseek-ai/dsh": "0.1.1-rc.2"` — exact, no range | `package.json` → `dependencies` (written by `--save-exact`) |
| **Lockfile SHA-256** | `5a490581d574512c3136ec984460e1e365b01dc27b70e855679bb54ce48e749c` | `sha256sum package-lock.json`, and `git show HEAD:package-lock.json \| sha256sum` — identical |
| Lockfile size | 401752 bytes, `lockfileVersion` 3, 663 package entries | `wc -c`, `node -e` over the lockfile |
| Installed pinned version | `0.1.1-rc.2` | `npm ls @deepseek-ai/dsh` → `└── @deepseek-ai/dsh@0.1.1-rc.2` |
| Pinned package entry point | `node_modules/@deepseek-ai/dsh/lib/bin.js` (8274 bytes) | `ls -l` in the worktree |
| Pinned entry SHA-256 | `c0226687bb20f45c603ec6fe50f3de16d1c3510c3a803304ec575ef9bc366c62` | `sha256sum node_modules/@deepseek-ai/dsh/lib/bin.js` |
| Lockfile entry for the pin | version `0.1.1-rc.2`, `license` MIT, `bin.dsh` → `lib/bin.js`, integrity as above | `node -e` over `package-lock.json` → `packages["node_modules/@deepseek-ai/dsh"]` |
| Commit carrying the pin | `60d52fe` "PATH A: pin @deepseek-ai/dsh 0.1.1-rc.2 as an exact dependency" | `git log --oneline` |

Two observations, both measured:

- The pinned build is a **different artifact** from the host's global build:
  the pinned `lib/bin.js` is 8274 bytes with SHA-256 `c0226687…`, the host's
  global `lib/bin.js` is 11697 bytes. Same name, different build.
- The milestone-1A lockfile was 82889 bytes with SHA-256
  `f13a57fd571abb63434975ef53b9706413a4ad4f1b554822a29d3329a2013d93`
  (`reports/milestone-1a-manifest.json` → `packageLockSha256`). The pinned
  lockfile is a different file; the 1A hash still describes the 1A release.

## 3. The runtime compatibility probe: it does not exist yet

**There is no compatibility probe, so there is no probe result.** This is
stated rather than worked around: the brief allows either a probe result or
an explicit statement that the probe does not exist and what it would have to
assert. The second applies.

Measured, not assumed:

- `grep -rni "deepseek|@deepseek-ai" --include=*.ts src tests` → **no
  matches**. No module in the kernel imports DSH.
- The only runtime adapters that exist are `src/adapters/fake-agent-runtime.ts`
  and `src/adapters/hermes-agent-runtime.ts`. The Hermes adapter is a
  *different host* (Hermes Agent); it is not a DSH adapter.
- `grep -rni "probe" --include=*.ts src tests` returns only an unrelated
  public-action test helper. No startup probe exists.

What such a probe would have to assert, taken from §N9 requirements 1–4 and
from what the pin has to be worth:

1. **Version identity.** The installed package is exactly the declared pinned
   version (`0.1.1-rc.2`), and its integrity matches the committed lockfile
   entry. A probe that reads a version string alone would accept a mutated
   tarball.
2. **Executable and package hashes.** §N9 req. 2: the adapter records the
   executable hash and the package hash. For this pin those are
   `c0226687bb20f45c603ec6fe50f3de16d1c3510c3a803304ec575ef9bc366c62`
   (`lib/bin.js`) and the lockfile SHA-256
   `5a490581d574512c3136ec984460e1e365b01dc27b70e855679bb54ce48e749c`.
3. **Required symbols, services and events present.** §N9 req. 3: the probe
   runs at startup against the pinned install and checks that every DSH symbol,
   service and event the adapter depends on is actually there. Concretely for
   this adapter boundary: the DSH build exposes the hooks behind the
   Colony-owned interfaces `AgentRuntime`, `PromptAssembler`,
   `ToolDispatcher`, `SessionRecorder`, `SubagentSpawner`,
   `HumanApprovalTransport`, `LifecycleController`, `TelemetrySink`, and the
   DSH services/events the adapter subscribes to. Each check names the symbol
   it looked for and what it found.
4. **Failure is loud.** §N9 req. 4: a missing symbol, service or event makes
   startup **fail**. It must not degrade to a fake runtime, and it must not
   fall back to the host's global DSH (`0.2.0-rc.2`) — a silent fallback to
   the global install is exactly the unpinned behaviour a pin exists to
   prevent.
5. **The probe runs against the pinned install**, i.e. the project-local
   `node_modules/@deepseek-ai/dsh@0.1.1-rc.2`, not the global one.
6. **The probe's output is recorded** as the receipt that the pinned runtime
   was exercised, not asserted.

Until such a probe exists and passes, no version — `0.1.1-rc.2`,
`0.2.0-rc.2` or otherwise — can be certified as compatible with this
kernel. That is the same conclusion `dsh-runtime-pin-plan.md` reached:
*"until §N9's compatibility probe exists, no version can be certified as
compatible, so pinning one now would only freeze an unverified claim."*
Executing PATH A produced the artifact; it did not produce the certification.

## 4. Observed drift — reported, not fixed

| Where the version comes from | Version | Measured |
|---|---|---|
| The specification's literal PATH A pin (§N9) | `0.1.1-rc.2` | normative text, unchanged (R5) |
| The pin now committed in this repository | `0.1.1-rc.2` | 2026-10-20, this tree |
| The version the **host** runs | `0.2.0-rc.2` | 2026-10-20, `dsh --version` |
| npm's `latest` | `0.2.1-rc.2` | 2026-10-20, `npm view @deepseek-ai/dsh version` |

Stated plainly: **the pinned version and the version the host runs are
different packages, and npm's latest is newer than both.** The host moved
from a system-wide install to an nvm-managed one and the installed version
moved with it; the specification recorded its own observation when it was
written and is not edited (R5).

The pinned version stays at the specification's literal value,
`0.1.1-rc.2`. It was **not** moved to `0.2.0-rc.2` or to `latest` to make
the numbers agree, and it will not be: a pin that moves by itself is not a
pin, and silently widening the pin would convert an unverified claim into a
different unverified claim. The drift is a decision for the Owner, on the
sequence `dsh-runtime-pin-plan.md` already proposes — pin `0.1.1-rc.2` first,
then probe `0.2.0-rc.2` and record the result, and if the probe passes, move
the pin forward explicitly with that output as the evidence. That proposal is
**not ratified**, and nothing in this artifact ratifies it.

## 5. Unresolved items

Listed as unresolved. None of these is closed by this file.

1. **The version choice is not ratified.** Spec literal `0.1.1-rc.2`, host
   `0.2.0-rc.2`, npm latest `0.2.1-rc.2`. The pin deliberately holds the
   specification's literal value; the decision to keep it, or to move it after
   a probe, belongs to the Owner.
2. **The compatibility probe does not exist** (§3 above). Until it exists and
   passes, the pin remains unestablished and no version is certified
   compatible. This is the blocking item for the `colony-dsh-adapter`.
3. **The "zero runtime dependencies" claim is now false in three places.**
   Measured after the pin: `AGENTS.md:76` ("zero runtime deps"),
   `docs/site/index.html:7` and `:9` ("zero runtime dependencies" in the meta
   and og:description) and `docs/site/index.html:67` (the badge
   `<b>0</b> runtime dependencies`), and `docs/IMPLEMENTATION_STATUS.md:3`
   ("Runtime dependencies: none"). The tree now has exactly one runtime
   dependency, `@deepseek-ai/dsh` at `0.1.1-rc.2`. **Not edited here**: those
   files are being edited by the live session that works in
   `/home/fares/Projects/colony-kernel`, and a claim that changed is the
   Owner's to state, not an agent's to quietly rewrite. The fix is a wording
   change on those four lines ("1 runtime dependency, pinned"), not a gate
   change. No gate enforces the dependency count: `scripts/check-claims.mjs`
   measures the test count only.
4. **The handoff's recorded hash changed.** Adding the link to
   `docs/colony-skeleton-handoff-v0.1.1.md` changed its SHA-256 from
   `ed15ef7b5cb5e7c2b443b5f13f42f9ebe43439744efb9480e99350d80a2745c1` to
   `fffbb02085fb5adb9ba2f8d424e9721dfe0e7ce7360414109b879aef5c6165f6`
   (5372 → 5655 bytes). That old hash is recorded in two files this task was
   forbidden to edit: `docs/INPUT_MANIFEST.json` (`handoff.sha256`) and
   `reports/milestone-1a-manifest.json` (`normativeInputs`). Both now state a
   hash that no longer matches the file. **A human must update both**, with
   the new hash above, or re-pin the handoff. Note the pre-existing
   inconsistency in the same manifest: `docs/INPUT_MANIFEST.json` records
   `handoff.bytes` as `7161` while the file was `5372` bytes before this
   change — that discrepancy predates this work and is not a result of it.
   Both manifests were already stale about *themselves* at the base commit:
   `reports/milestone-1a-manifest.json` records its own size as `15800`
   bytes and its own SHA-256 as `c3419b6c…`, while the file at `main` is
   `15747` bytes with SHA-256 `2682ad7d…`; `docs/INPUT_MANIFEST.json`
   records itself as `1451` bytes / `7a21b7b1…` against an actual `1480`
   bytes / `3ad9188b…`. Measured at the base commit — whoever updates these
   manifests should recompute every entry, not only the handoff's.
5. **The milestone-1A record now describes a past tree.** It records
   `runtimeDependencies: {}` and `packageLockSha256: f13a57fd…`. That stays
   true of milestone 1A and is not rewritten (milestone records are
   superseded, never rewritten), but anyone reading it as the state of HEAD
   will be misled.
6. **The tracker spec still describes the DSH position in prose.** Tracker
   issue 11 also expects the tracker spec CK-001
   (`~/.dsh/tracker/specs/01-colony-kernel-v0-1.md`) to link this file
   instead of describing it in prose. That file lives outside the repository
   and outside the worktree this task was scoped to, so it was not touched.
7. **No adapter, no conformance evidence.** There is no `colony-dsh-adapter`
   package, no `AgentRuntime` implementation backed by DSH, and no adapter
   review. Per R8 the adapter needs its own review before merge, and per
   `docs/IMPLEMENTATION_STATUS.md` the DSH adapter is still listed as
   deferred (M2).
8. **The install needs the network.** PATH A resolved 441 packages against
   the public registry in 16 minutes; the lockfile now pins 663 packages. CI
   (`npm ci`) needs registry access to reproduce the tree, and PATH B remains
   the documented fallback if that is not acceptable.

## 6. Verification performed on this tree

`npm run verify` was run **twice**: once at the base commit before the pin,
and once after it. The gate sequence is typecheck → lint → tests →
`check-claims` → demo twice (byte-identical).

The run after the pin — the tree that contains the committed lockfile — ends:

```
gate claims: OK (135 tests, 4 surfaces agree)
gate demo: OK (byte-identical reruns, 5613 bytes)
verify: ALL GATES GREEN
```

**No gate broke.** The pinned dependency did not weaken, block or alter any
gate, and no gate was changed to let it through: `scripts/verify.sh` and
`scripts/check-claims.mjs` are byte-identical to the base commit. The
baseline run at the base commit produced the same result (135 tests, same
demo bytes). The full tail of the final run is reproduced in the commit
message of the link commit.

What the gates do **not** cover, stated so the green result is not read as
more than it is: nothing in the suite imports DSH, so the suite says nothing
about the pinned package working. A green `npm run verify` here means the
tree is healthy, not that DSH `0.1.1-rc.2` is compatible with this kernel.

## 7. Reproduce

Every step of this artifact, from a clean checkout of this branch:

```
# the worktree this was executed in
git -C /home/fares/Projects/colony-kernel worktree add \
  /home/fares/.dsh/worktrees/colony-kernel-evidence -b feat/dsh-evidence ce719b5
cd /home/fares/.dsh/worktrees/colony-kernel-evidence
git merge --ff-only main          # the base commit in the brief was one commit behind main

# host facts
dsh --version
command -v dsh
ls -d /home/fares/.nvm/versions/node/v26.8.2/lib/node_modules/@deepseek-ai/dsh
npm view @deepseek-ai/dsh version
npm view @deepseek-ai/dsh dist-tags
npm view @deepseek-ai/dsh versions --json
npm view @deepseek-ai/dsh@0.1.1-rc.2 dist.integrity

# PATH A, exactly as §N9 writes it
npm install --save-exact @deepseek-ai/dsh@0.1.1-rc.2
git add package.json package-lock.json
git -c user.name="faresrafat3" -c user.email="faresrafat3@gmail.com" \
  commit -m "PATH A: pin @deepseek-ai/dsh 0.1.1-rc.2 as an exact dependency"

# the lockfile hash
sha256sum package-lock.json
git show HEAD:package-lock.json | sha256sum     # identical

# the pinned version, and the probe's absence
npm ls @deepseek-ai/dsh
sha256sum node_modules/@deepseek-ai/dsh/lib/bin.js
grep -rni "deepseek\|@deepseek-ai" --include=*.ts src tests   # no matches

# the gates
npm run verify
```
