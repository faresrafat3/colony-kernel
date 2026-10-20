# DSH compatibility evidence

**Status: the pin is established.** PATH A has been executed, the
compatibility probe required by §N9 exists and has run against both candidate
versions, and its output decided the version: the pin is `0.2.1-rc.2`, the
version the host runs. The `package.json` change is its own commit; this file
records what was measured, what was executed, what drifted, and what remains
open. It states the drift; it does not silently repair it.

Scope: this artifact records the **runtime pin**. It is not adapter
conformance evidence, it does not certify Milestone 2, and it does not certify
that the DSH runtime works with this kernel's domain logic — it certifies that
the DSH runtime **exposes the surfaces the adapter contract needs**, which is
what §N9 requirements 1–4 ask for. No Colony code imports DSH, and no DSH code
was executed by the kernel: the DSH packages were installed, imported and
inspected, and the kernel's own gates do not depend on them.

Provenance: measured on this host on **2026-10-20** (Node v26.12.0, npm
12.2.0, Linux x86_64), on branch `feat/n9-probe` in the worktree
`/home/fares/.dsh/worktrees/colony-kernel-probe`. Commit `60d52fe` carried the
first pin; `dff3dab` added the probe; the commit that follows it moves the pin
to the version the probe selected. Nothing in the published checkout
`/home/fares/Projects/colony-kernel` was modified.

Normative basis: `docs/colony-kernel-v0.1.1.md` §N9 (requirements 1–4 and the
two allowed paths) and the DSH-mapping reference M08 in the same document
(N7 note). Decision record: `docs/dsh-runtime-pin-plan.md`.

## 1. Measured facts

Every row is a command that was run, with the output it produced. None is
copied from the specification or from another document. The host moved during
the day: an earlier measurement of the same tree recorded `0.2.0-rc.2` on Node
v26.8.2, and that record is now **stale** — see §6.

| Fact | Value | Command |
|---|---|---|
| DSH version the **host** runs right now | `0.2.1-rc.2` | `dsh --version` |
| `dsh` on PATH | `/home/fares/.nvm/versions/node/v26.12.0/bin/dsh` | `command -v dsh` |
| The host process | pid 19488, started 2026-10-20 17:29:42, `node …/v26.12.0/bin/dsh web --no-open --port 3080` | `ps -o pid,lstart,cmd -p 19488` |
| Node on PATH | `v26.12.0` | `node --version` |
| Host global install | `/home/fares/.nvm/versions/node/v26.12.0/lib/node_modules/@deepseek-ai/dsh` | `ls -d` on that path |
| Host global package version | `0.2.1-rc.2` | `node -e "console.log(require('<that path>/package.json').version)"` |
| The **old** install, still on disk | `0.2.0-rc.2` at `/home/fares/.nvm/versions/node/v26.8.2/lib/node_modules/@deepseek-ai/dsh` | same command over `v26.8.2` |
| Latest version published on npm | `0.2.1-rc.2` | `npm view @deepseek-ai/dsh version` |
| npm dist-tags | `latest` = `0.2.1-rc.2`, `next` = `0.2.1-rc.2`, `alpha` = `0.2.1-alpha.5` | `npm view @deepseek-ai/dsh dist-tags` |
| Tarball integrity of `0.1.1-rc.2` | `sha512-UP1UIh6q3Gme/yXRn/QL2P8IsVlv8Shpg22TRJIZPsCRWLm4CBiA1MUvXmJAfsOEETBMLAl+xWPtFw6ICsN3wg==` | `npm view @deepseek-ai/dsh@0.1.1-rc.2 dist.integrity` |
| Tarball integrity of `0.2.1-rc.2` | `sha512-tvY+yhfKRifthbqPe/OK0AYxM5ZkvqfYq/jMYgJcEUxiRRL1Vwra3Ti5TB6AXgSWQdiPHYh/Vp6SJa9yHwMNuw==` | `npm view @deepseek-ai/dsh@0.2.1-rc.2 dist.integrity` |

The two `npm view` calls are the **only** network access in this work, and
they are deliberately outside the probe: they are the manual step the probe's
test must not perform. The probe re-verifies the same values from the **local
npm cache** instead (§3.4).

## 2. The pin method: PATH A, executed as written

§N9 PATH A: *"create the Colony package root; `npm install --save-exact
@deepseek-ai/dsh@0.1.1-rc.2`; commit `package-lock.json`; record lockfile
SHA-256 in the adapter manifest. Runtime compatibility probe runs at startup
against this pinned install."*

The command, run in the worktree, verbatim — first for the version the adapter
contract was derived from, then for the version the probe selected:

```
npm install --save-exact @deepseek-ai/dsh@0.1.1-rc.2
npm install --save-exact --offline @deepseek-ai/dsh@0.2.1-rc.2
```

Results (real output): `added 441 packages, and audited 574 packages in 16m`,
exit status `0`; then `added 250 packages, removed 102 packages, and changed
204 packages in 20s`, exit status `0`. The second install was resolved from the
**local npm cache** (`--offline`), so it cost no network.

### 2.1 The first pin: `0.1.1-rc.2` (commit `60d52fe`)

| Fact | Value | Source |
|---|---|---|
| Pin method | **PATH A** (project-local exact install) | §N9; the command above |
| Declared dependency | `"@deepseek-ai/dsh": "0.1.1-rc.2"` — exact, no range | `package.json` → `dependencies` (written by `--save-exact`) |
| **Lockfile SHA-256** | `5a490581d574512c3136ec984460e1e365b01dc27b70e855679bb54ce48e749c` | `sha256sum package-lock.json`, and `git show 60d52fe:package-lock.json \| sha256sum` — identical |
| Lockfile size | 401752 bytes, `lockfileVersion` 3, 663 package entries | `wc -c`, `node -e` over the lockfile |
| Installed pinned version | `0.1.1-rc.2` | `npm ls @deepseek-ai/dsh` → `└── @deepseek-ai/dsh@0.1.1-rc.2` |
| Pinned package entry point | `node_modules/@deepseek-ai/dsh/lib/bin.js` (8274 bytes) | `ls -l` in the worktree |
| Pinned entry SHA-256 | `c0226687bb20f45c603ec6fe50f3de16d1c3510c3a803304ec575ef9bc366c62` | `sha256sum node_modules/@deepseek-ai/dsh/lib/bin.js` |
| Lockfile entry for the pin | version `0.1.1-rc.2`, `license` MIT, `bin.dsh` → `lib/bin.js`, integrity `sha512-UP1UIh6q3Gme/…` | `node -e` over `package-lock.json` → `packages["node_modules/@deepseek-ai/dsh"]` |
| Commit carrying the pin | `60d52fe` "PATH A: pin @deepseek-ai/dsh 0.1.1-rc.2 as an exact dependency" | `git log --oneline` |

### 2.2 The pin as it stands: `0.2.1-rc.2` (the commit that moves it)

| Fact | Value | Source |
|---|---|---|
| Declared dependency | `"@deepseek-ai/dsh": "0.2.1-rc.2"` — exact, no range, not a dist-tag | `package.json` → `dependencies` (written by `--save-exact`) |
| **Lockfile SHA-256** | `1dae9830c15065b73dc06409175ddf0abf88f1f458946025285d6773fe0772fc` | `sha256sum package-lock.json`, and `git show HEAD:package-lock.json \| sha256sum` — identical |
| Lockfile size | 480945 bytes, `lockfileVersion` 3 | `wc -c`, `node -e` over the lockfile |
| Installed pinned version | `0.2.1-rc.2` | `npm ls @deepseek-ai/dsh` → `└── @deepseek-ai/dsh@0.2.1-rc.2` |
| Pinned entry SHA-256 | `80112efe368efb1a39720c7ada0af00442e5131fb2744edaaff8a3e8bb499e6f` (11772 bytes) | `sha256sum node_modules/@deepseek-ai/dsh/lib/bin.js` |
| Lockfile entry for the pin | version `0.2.1-rc.2`, `license` MIT, `bin.dsh` → `lib/bin.js`, integrity `sha512-tvY+yhfKRifthbqPe/…` | `node -e` over `package-lock.json` → `packages["node_modules/@deepseek-ai/dsh"]` |
| The pinned bytes == the host's bytes | the same `lib/bin.js` sha256 `80112efe…` as the host's global install | §4.1 — the same published tarball, installed twice |

Two observations, both measured:

- The `0.1.1-rc.2` pinned build was a **different artifact** from the host's
  global build: the pinned `lib/bin.js` is 8274 bytes with SHA-256 `c0226687…`,
  the host's
  global `lib/bin.js` is 11772 bytes with SHA-256 `80112efe…`. Same name,
  different build. After the pin moved, the project's own install and the
  host's global install are the **same bytes** (`80112efe…`) — the same
  published tarball, installed twice.
- The milestone-1A lockfile was 82889 bytes with SHA-256
  `f13a57fd571abb63434975ef53b9706413a4ad4f1b554822a29d3329a2013d93`
  (`reports/milestone-1a-manifest.json` → `packageLockSha256`). The pinned
  lockfile is a different file; the 1A hash still describes the 1A release.

## 3. The compatibility probe: it exists

`scripts/dsh-compat-probe.mjs` is the §N9 startup compatibility probe, built
as a standalone module the M2 adapter will call at startup. Two modes, as the
plan requires:

- `--require` runs the probe and **exits non-zero with a loud, named failure**
  when a required symbol, service or event is missing. That is §N9
  requirement 4 — "startup fails".
- `--json <path>` writes the machine-readable receipt: the version, the
  hashes, every requirement with its status, the verdict, the timestamp.

The adapter package (`colony-dsh-adapter`) does not exist yet — it is M2 work,
and R8 gates it behind its own review — so the probe is built here, on its
own, and the adapter calls it.

### 3.1 What counts as a required symbol / service / event

The requirement set is derived from two normative sources and nothing else:

1. §N9's own list: *"Adapter exposes Colony-owned interfaces: `AgentRuntime`,
   `PromptAssembler`, `ToolDispatcher`, `SessionRecorder`, `SubagentSpawner`,
   `HumanApprovalTransport`, `LifecycleController`, `TelemetrySink`."*
2. The DSH runtime's own public surface in the installed package: the exported
   symbol, the Cordis service name, and the wire event name that each of
   those eight interfaces needs from DSH.

**The DSH-mapping reference M08 named by the specification is not in this
repository.** The spec cites it twice (N7's note, and §N9's reference to
`dsh-runtime-pin-plan.md`), and `docs/colony-kernel-v0.1.1-to-v0.1.1-delta.md`
records the section-by-section semantic mapping as an open, unwritten item; the
spec's own per-AC table (`A1`…`A35`) has no `M` counterpart here, and the
`review-packet-v0.1.1/` bundle the spec points at is not in the repository
either. The probe therefore reads the DSH surface **from the installed
package itself** rather than from a mapping document that does not exist.
This is recorded as an open item (§7.4), not worked around.

### 3.2 The 33 requirements, and how each is checked

| # | Colony interface | DSH-side surface | Check |
|---|---|---|---|
| 1 | `AgentRuntime` | export `AgentRegistry` | `export` |
| 2 | `AgentRuntime` | service name `agents` | `service` |
| 3 | `AgentRuntime` | export `AgentLoop` | `export` |
| 4 | `AgentRuntime` | service name `agentLoop` | `service` |
| 5 | `AgentRuntime` | event name `agent/status` | `event` |
| 6 | `PromptAssembler` | export `SystemPrompt` | `export` |
| 7 | `PromptAssembler` | service name `systemPrompt` | `service` |
| 8 | `PromptAssembler` | event name `system-prompt/assemble` | `event` |
| 9 | `ToolDispatcher` | export `ToolRuntime` | `export` |
| 10 | `ToolDispatcher` | export `defineTool` | `export` |
| 11 | `ToolDispatcher` | service name `tools` | `service` |
| 12 | `ToolDispatcher` | event name `tools/change` | `event` |
| 13 | `SessionRecorder` | export `SessionStore` | `export` |
| 14 | `SessionRecorder` | export `KNOWN_SESSION_EVENT_TYPES` | `export` |
| 15 | `SessionRecorder` | service name `sessions` | `service` |
| 16 | `SessionRecorder` | event name `session/event` | `event` |
| 17 | `SessionRecorder` | event name `session/created` | `event` |
| 18 | `SubagentSpawner` | export `SubagentRuntime` | `export` |
| 19 | `SubagentSpawner` | export `SubagentRunId` | `export` |
| 20 | `SubagentSpawner` | service name `subagents` | `service` |
| 21 | `SubagentSpawner` | event name `subagent/start` | `event` |
| 22 | `HumanApprovalTransport` | export `ApprovalService` | `export` |
| 23 | `HumanApprovalTransport` | export `APPROVAL_POLICIES` | `export` |
| 24 | `HumanApprovalTransport` | service name `approval` | `service` |
| 25 | `HumanApprovalTransport` | event name `approval/request` | `event` |
| 26 | `LifecycleController` | export `boot` | `export` |
| 27 | `LifecycleController` | export `initProfile` | `export` |
| 28 | `LifecycleController` | export `installFailLoud` | `export` |
| 29 | `LifecycleController` | export `Service` (the disposer-owning base every DSH service extends) | `export` |
| 30 | `TelemetrySink` | export `SessionTelemetryCoordinator` | `export` |
| 31 | `TelemetrySink` | service name `sessionTelemetry` | `service` |
| 32 | `TelemetrySink` | export `TokenMeter` | `export` |
| 33 | `TelemetrySink` | service name `tokenMeter` | `service` |

Each owning package is resolved from the installed tree, not guessed:
`@deepseek-ai/dsh-agent`, `dsh-agent-loop`, `dsh-system-prompt`, `dsh-tools`,
`dsh-session`, `dsh-subagent`, `dsh-user-approval`, `dsh-app-boot`,
`dsh-session-telemetry`, `dsh-token-meter`, and `@deepseek-ai/cordis`.

### 3.3 The four check methods, and what each one proves

| Method | What the probe does | What it proves | What it does **not** prove |
|---|---|---|---|
| `export` | dynamic `import()` of the owning package's entry point; the named export must be on the module namespace | the symbol exists **at runtime**, in this build | that the adapter can call it correctly |
| `service` | the owning package's installed source must register the Cordis service under that name — `super(ctx, "<name>")` | the service name is **declared by the installed build** | that a live context was booted and the service resolved |
| `event` | the owning package's installed source must contain the event name as a string literal | the event name is **declared by the installed build** | that the event is emitted, or that a listener ever fires |
| `file` | the named file must exist in the owning package; its SHA-256 is recorded | the file ships in this build | its contents are correct |

The `service` and `event` methods are **source-declaration checks, not live
dispatch checks**, and the receipt says so on every line: each result records
the file and line where the declaration was found, so a reader can audit the
claim instead of taking it on trust. A live-context check would require
booting a full DSH application — a side-effecting operation that a startup
gate has no business performing. Stated plainly, so the green result is not
read as more than it is.

### 3.4 §N9 requirements 1–2: identity and hashes

| §N9 | Requirement | How the probe checks it |
|---|---|---|
| 1 | "Adapter declares the exact tested DSH package version." | the installed `package.json` version must equal the declared version (`--expect-version`, defaulting to the pin in the project's `package.json`); the receipt records both |
| 2 | "Adapter records executable and package hashes." | the executable hash is the SHA-256 of the package's own `bin.dsh` target (`lib/bin.js`); the package hash is a SHA-256 over a deterministic manifest of the package's files; a third hash covers the whole adapter dependency set. The definition is printed in the receipt, so the value is reproducible without reading the probe. |
| 2 (strengthening) | the tarball the lockfile names | the lockfile's recorded `integrity` is re-computed from the **local npm cache** — the cached tarball is re-hashed with SHA-512 and compared. No network. "Unknown" is never reported as a pass: if the tarball is not cached, the status is `not-verified`, not `pass`. |

### 3.5 The resolution rule: no global fallback

The DSH package is resolved **only** from the project's own `node_modules`:
`<projectRoot>/node_modules/@deepseek-ai/dsh`. The resolved path, and the path
of every sub-package the probe loads, must stay under the project root.

- A project root with no local install is a **startup failure**, with a
  message that names the path that was expected and states that a global
  install is never used as a fallback. The probe never consults the npm
  global prefix, so it cannot fall back to one.
- A `node_modules/@deepseek-ai/dsh` symlink that resolves outside the project
  root is refused for the same reason.
- Every receipt records `resolution.globalFallbackUsed: false` and
  `resolution.resolvedWithinProjectRoot: true`.

This is the rule the previous version of this document called for and the
previous version of it did not have: *"it must not fall back to the host's
global DSH — a silent fallback to the global install is exactly the unpinned
behaviour a pin exists to prevent."*

### 3.6 The probe is tested without the network and without a wall clock

`tests/unit/dsh-compat-probe.test.ts` — 12 tests, part of the 147 the gate
measures:

- **Trip cases** (three of them: a missing symbol, a missing service, a
  missing event) — a fixture package that is missing one required surface
  makes the probe fail, and the failure **names the missing item**: its
  requirement id, its symbol, and the Colony interface that needs it. A
  fourth trip case breaks the CLI itself and asserts the non-zero exit status
  and the named failure on stderr.
- **Allow case** — a fixture that satisfies every requirement passes every
  check, and the receipt records the version, the hashes and the verdict.
- **No-global-fallback cases** — a project root with no local install fails
  loudly and resolves nothing; the resolver throws `DSH_PACKAGE_NOT_RESOLVED`;
  a symlink out of the project root fails with
  `DSH_PACKAGE_OUTSIDE_PROJECT_ROOT`.
- **No clock, no network** — the receipt's timestamp is injected, so the gate
  path never reads a wall clock; the probe's source is asserted to import no
  `node:http`/`node:https`/`node:net`/`node:dns` and to call no `fetch`,
  `Date.now` or `Math.random`.

The integrity comparison uses the **lockfile's recorded integrity** and the
local npm cache; the live `npm view` comparison is a separate, manually run
step whose output is recorded in the receipt (as `integrity.source:
"manual-npm-view"`), never in the gate.

The fixtures are materialised on disk because the `export` check is a real
dynamic `import()` of an installed package — an ESM import needs real files.
They are byte-fixed, live in a private temporary directory, and nothing
outside that directory is read.

## 4. The receipts

Three receipts live in `reports/`. Each records the command that produced it
and its exit status.

| Receipt | Target | Command | Exit | Verdict |
|---|---|---|---|---|
| `reports/dsh-compat-probe-0.1.1-rc.2-pinned.json` | the **first pinned project-local install** `0.1.1-rc.2` | `node scripts/dsh-compat-probe.mjs --require --json reports/dsh-compat-probe-0.1.1-rc.2-pinned.json --expect-version 0.1.1-rc.2` | `0` | **PASS** — 33/33 surfaces, capability pass, identity pass |
| `reports/dsh-compat-probe-0.2.1-rc.2-host.json` | the version the **host runs now**, `0.2.1-rc.2` | `node scripts/dsh-compat-probe.mjs --require --json reports/dsh-compat-probe-0.2.1-rc.2-host.json --project-root /home/fares/.nvm/versions/node/v26.12.0/lib --expect-version 0.2.1-rc.2 --lockfile …/package-lock.json --expected-integrity sha512-tvY+yhf… --integrity-source manual-npm-view` | `0` | **PASS** — 33/33 surfaces, capability pass, identity pass |
| `reports/dsh-compat-probe-0.2.1-rc.2-pinned.json` | the **pinned project-local install as it now stands**, `0.2.1-rc.2` | `node scripts/dsh-compat-probe.mjs --require --json reports/dsh-compat-probe-0.2.1-rc.2-pinned.json --expect-version 0.2.1-rc.2` | `0` | **PASS** — 33/33 surfaces, capability pass, identity pass |

The host install is probed with `--project-root
/home/fares/.nvm/versions/node/v26.12.0/lib` so that the host's install *is*
the project-local install of that root: the "no global fallback" rule is not
bent to accommodate the measurement, it is satisfied by construction.

The third receipt is the one that closes the loop: it is the probe run against
the install this repository now pins, with the integrity taken from the
lockfile — the value a startup gate would compare against.

### 4.1 What each receipt measured

| | pinned `0.1.1-rc.2` | host `0.2.1-rc.2` | pinned `0.2.1-rc.2` (now) |
|---|---|---|---|
| Resolved path | `<worktree>/node_modules/@deepseek-ai/dsh` | `/home/fares/.nvm/versions/node/v26.12.0/lib/node_modules/@deepseek-ai/dsh` | `<worktree>/node_modules/@deepseek-ai/dsh` |
| Inside the project root | yes | yes | yes |
| Global fallback used | **no** | **no** | **no** |
| Declared version = installed version | `0.1.1-rc.2` = `0.1.1-rc.2` | `0.2.1-rc.2` = `0.2.1-rc.2` | `0.2.1-rc.2` = `0.2.1-rc.2` |
| Executable (`lib/bin.js`) | 8274 bytes, sha256 `c0226687bb20f45c603ec6fe50f3de16d1c3510c3a803304ec575ef9bc366c62` | 11772 bytes, sha256 `80112efe368efb1a39720c7ada0af00442e5131fb2744edaaff8a3e8bb499e6f` | 11772 bytes, sha256 `80112efe368efb1a39720c7ada0af00442e5131fb2744edaaff8a3e8bb499e6f` |
| Package content hash | `84fc2df49fd0d5d1971ccfd7a402adb4529bddee8dceccc66edac2f95688601a` | `b8e758ede6cc27146be841a2ec4def1b7999990324f34c8be38eaa260e10bb7e` | `b8e758ede6cc27146be841a2ec4def1b7999990324f34c8be38eaa260e10bb7e` |
| Adapter dependency-set hash | `55810dc135130ab67822ad13cf1bf76864c5a33b677608b2685fc755b6bb6cf2` | `517277f296337aff4ac0606303ba6ddcf59b349909e93eafb0db87434ba772a3` | `e0b90087e94bb06d88ea2d51b93bf937e2a7d52b2b108b1ea1a430f7021b5ecc` |
| Lockfile the integrity came from | sha256 `5a490581…` (the `0.1.1-rc.2` lockfile) | sha256 `5a490581…` (the `0.1.1-rc.2` lockfile) | sha256 `1dae9830…` (the `0.2.1-rc.2` lockfile) |
| Integrity source | `lockfile` | `manual-npm-view` (the registry value, re-hashed from the local cache) | `lockfile` |
| Integrity result | **pass** — the cached tarball re-hashes to `sha512-UP1UIh6q3Gme/…` | **pass** — the cached tarball re-hashes to `sha512-tvY+yhfKRifthbqPe/…` | **pass** — the cached tarball re-hashes to `sha512-tvY+yhfKRifthbqPe/…` |
| Surfaces passed | **33 / 33** | **33 / 33** | **33 / 33** |
| Missing items | none | none | none |

The three receipts are two different builds, probed twice: `0.1.1-rc.2` once,
and `0.2.1-rc.2` twice — once where the host has it, once where this
repository pins it. The two `0.2.1-rc.2` receipts agree on the executable and
package hashes (the same published tarball) and differ only in the
dependency-set hash, because the project's dependency set is not the host's.
Both versions satisfy the adapter contract. **No required capability is
missing in either version** — there is no finding of that kind to record.

### 4.2 A structural difference the probe does not cover — recorded, not worked around

The 33 surfaces pass in both versions, but the two packages are not the same
shape. Measured on 2026-10-20, by installing each version into its own
directory and counting:

```
find node_modules -name "invariant.js" -path "*/lib/*" -printf "%h\n" | xargs -n1 dirname | sort -u | wc -l
grep -rl "scopedSubjectResolvers" node_modules/@deepseek-ai/ | head
```

| | `0.1.1-rc.2` | `0.2.1-rc.2` (the pin) |
|---|---|---|
| Packages shipping a `lib/invariant.js` companion file | **225** | **0** |
| `dsh-scope/lib/` contents | `index.js`, `invariant.js`, `types/` | `index.js`, `types/` |
| `scopedSubjectResolvers` (the generated scoped-event routing-subject table) | present in `dsh-scope/lib/invariant.js` | **absent from the whole tree** |
| `dsh-scope`'s public exports | `scopeTarget`, `createScope`, `ScopedLayers`, … (11) | the same 11 |

In `0.1.1-rc.2` every package shipped a generated `lib/invariant.js` whose
first section is the scoped-event routing-subject table — the map from an event
name to the subject its scope is filtered by (`"agent/status" → args[0].agent`,
`"session/created" → null`, and so on). In `0.2.1-rc.2` that generated
companion file is gone from every package, and the identifier
`scopedSubjectResolvers` appears nowhere in the installed tree. The
`dsh-scope` package's **public exports are unchanged**, which is why all 33
surfaces still pass.

**What this means, stated plainly:** the adapter-facing surface the probe
checks is stable across the two versions, but the *scoped routing* of those
events is not something the probe verifies — the probe checks that an event
name is declared, not how its scope is resolved. §N9 requirement 7 (DSH events
translated into Colony-owned events) and requirement 8 (unknown DSH events
logged but unable to advance mission state) are adapter-side obligations whose
implementation will depend on how the version it runs under routes scoped
events. The M2 adapter must answer that against the version it will run; this
record exists so the question is asked rather than assumed away.

It is recorded here as a finding, and it did not weaken a requirement: the
probe still checks all 33 surfaces, and the pin still names an exact version.

## 5. The version decision

**The pin is `0.2.1-rc.2`.** It moved forward from `0.1.1-rc.2` on the
strength of the probe's output.

The decision follows the rule this repository already wrote down, in
`docs/dsh-runtime-pin-plan.md` §Decision step 2: *"Then probe the version the
host actually runs and record the result. If the probe passes, the pin moves
forward explicitly, with the probe output as the evidence."* The probe passed
(`reports/dsh-compat-probe-0.2.1-rc.2-host.json`, 33/33, exit 0), so the pin
moved forward explicitly, with that receipt as the evidence.

Why this is the right target, and not merely a permitted one:

1. **The adapter runs inside the host.** §N9 requirement 1 makes the adapter
   declare the exact tested version, and the startup probe compares that
   declaration against the runtime that is actually loading. A pin that names
   `0.1.1-rc.2` while the host runs `0.2.1-rc.2` is a startup failure by
   construction — the probe turns it into a loud one, which is better than a
   silent one, but a loud failure is not a working adapter either.
2. **The target is now evidence, not a claim.** `0.2.1-rc.2` is no longer
   "whatever the host happens to have installed": it passed 33/33 surfaces in
   the host install, and it passes them again in a project-local install.
3. **The specification's version is not abandoned, it is checked.** Step 1 of
   the same rule — pin `0.1.1-rc.2` first, the version the adapter contract
   was derived from — was executed, and the probe passed against it too
   (`reports/dsh-compat-probe-0.1.1-rc.2-pinned.json`, 33/33, exit 0). The
   contract is satisfied by both; the pin names the one that will run.

What the decision is **not**:

- It is not `latest`. `0.2.1-rc.2` happens to be npm's `latest` tag at the
  moment of writing; the dependency is written as the literal exact string
  `0.2.1-rc.2` by `--save-exact`, the lockfile pins the tarball's SHA-512
  integrity, and the probe fails if the installed bytes are not those bytes.
  A pin that moves by itself is not a pin (plan step 3); this one cannot.
- It is not a certification of Milestone 2. R8's review gate applies to the
  adapter itself, and the adapter does not exist.
- It is not a claim that the DSH runtime works with this kernel's domain
  logic. The probe certifies the **surfaces**, not the semantics.

## 6. Observed drift — reported, not fixed

| Where the version comes from | Version | Measured |
|---|---|---|
| The specification's literal PATH A pin (§N9) | `0.1.1-rc.2` | normative text, unchanged (R5) |
| The pin committed in this repository | `0.1.1-rc.2` → **`0.2.1-rc.2`** | 2026-10-20, this tree |
| The version the **host** runs | `0.2.1-rc.2` | 2026-10-20, `dsh --version` |
| The **older** host install, still on disk | `0.2.0-rc.2` (Node v26.8.2) | 2026-10-20, `ls` over the nvm versions |
| npm's `latest` | `0.2.1-rc.2` | 2026-10-20, `npm view @deepseek-ai/dsh version` |

**The records in this repository were stale.** `docs/dsh-runtime-pin-plan.md`
and the earlier version of this file both stated that the host runs
`0.2.0-rc.2` at `/home/fares/.nvm/versions/node/v26.8.2/…`, measured at 05:50
on 2026-10-20. The host was restarted at 17:29 on the same day and now runs
`0.2.1-rc.2` on Node v26.12.0. The `0.2.0-rc.2` install is still on disk;
it is simply not the one running. The plan's table is corrected to the
measured values, and the old row is kept in this table as the drift it was.

The specification's own record (`0.1.1-rc.2` at `/usr/lib/node_modules/…`,
no lockfile) is normative history and is not edited (R5); the drift is
recorded here instead.

## 7. Unresolved items

Listed as unresolved. None of these is closed by this file.

1. **The adapter manifest that would carry the lockfile hash does not exist.**
   It ships with the M2 adapter. The probe records the lockfile hash and the
   package hashes in its receipt, so the values the manifest will need are
   already measured, but the manifest itself is M2 work.
2. **The adapter does not exist**, and neither does any conformance evidence
   for it. There is no `colony-dsh-adapter` package, no `AgentRuntime`
   implementation backed by DSH, and no adapter review. Per R8 the adapter
   needs its own review before merge.
3. **The `service` and `event` checks are source-declaration checks, not live
   dispatch checks** (§3.3). They prove the installed build declares the
   names; they do not prove a running context resolves the service or that a
   listener ever receives the event. A live check would need a booted DSH
   application, which a startup gate has no business performing.
4. **The DSH-mapping reference M08 is missing from this repository** (§3.1).
   The spec cites it; the delta document records the semantic mapping as
   unwritten; the `review-packet-v0.1.1/` bundle is not here either. The
   probe's requirement set was therefore derived from §N9's own interface
   list plus the installed package's public surface. A reader who expects M08
   to be the authority on "which DSH surface maps to which Colony interface"
   will not find it here, and that gap is not closed by this work.
5. **The probe's surface list is the adapter contract's first draft, and the
   adapter does not exist to confirm it.** If the M2 adapter needs a DSH
   surface that is not in the 33, the list must grow — and the probe will say
   so loudly, which is the behaviour §N9 requirement 4 asks for.
6. **§N9 requirements 5–10 are not implemented by the probe.** Reversible
   lifecycle registrations, unload removing listeners, DSH events translated
   into Colony-owned events, unknown DSH events logged but unable to advance
   mission state, and "DSH upgrade requires adapter tests before use" are
   adapter-side obligations, not probe-side checks. The probe answers
   requirements 1–4 only, which is what this work was scoped to.
7. **The two versions route scoped events differently, and the probe does not
   check that** (§4.2). `0.1.1-rc.2` shipped a generated per-package
   `lib/invariant.js` carrying the scoped-event routing-subject table (225
   packages); `0.2.1-rc.2` ships none of them, and the public `dsh-scope`
   exports are unchanged. The adapter's event translation must be built
   against the version it will run under; the probe checks event *names* only.
8. **The install needs the network.** PATH A resolved 441 packages against the
   public registry in 16 minutes; the lockfile pins 663 packages. CI (`npm ci`)
   needs registry access to reproduce the tree, and PATH B remains the
   documented fallback if that is not acceptable. (The re-install for the
   version move was resolved from the local npm cache, not the network.)
9. **The milestone-1A records describe a past tree.** `reports/milestone-1a-manifest.json`
   records `runtimeDependencies: {}` and the 1A lockfile hash. That stays true
   of milestone 1A and is not rewritten (milestone records are superseded,
   never rewritten), but anyone reading it as the state of HEAD will be misled.
10. **The "zero runtime dependencies" claim was false in four places — corrected
   2026-10-20.** `AGENTS.md`, `docs/site/index.html` (three places) and
   `docs/IMPLEMENTATION_STATUS.md` now state the one pinned dependency. No
   gate enforces the dependency count — `scripts/check-claims.mjs` measures the
   test count only — so the wording is the entire mechanism, which is why the
   tree could verify green while stating a false claim.
11. **The handoff's recorded hash changed** when the link to this artifact was
    added. `docs/INPUT_MANIFEST.json` carries the measured handoff hash and
    size; `reports/milestone-1a-manifest.json` was deliberately left alone (it
    describes the tree milestone 1A verified). The same note as before applies:
    both manifests were already stale about *themselves* at the base commit,
    and whoever updates them should recompute every entry, not only the
    handoff's.

## 8. Verification performed on this tree

`npm run verify` was run on the tree that carries the probe, before the
commit. The gate sequence is typecheck → lint → tests → `check-claims` → demo
twice (byte-identical). The tail of the run is reproduced in the commit
message.

What the gates do **not** cover, stated so the green result is not read as
more than it is: the kernel still imports nothing from DSH, so the suite says
nothing about the pinned package's *behaviour*. The probe is a separate,
explicitly run step with its own receipts; `npm run verify` being green means
the tree is healthy, and the receipts mean the DSH surfaces were exercised.

## 9. Reproduce

Every step of this artifact, from a clean checkout of this branch:

```
# the worktree this was executed in
git -C /home/fares/Projects/colony-kernel worktree add \
  /home/fares/.dsh/worktrees/colony-kernel-probe -b feat/n9-probe main
cd /home/fares/.dsh/worktrees/colony-kernel-probe
npm ci --offline

# host facts (re-measure; they moved during the day)
dsh --version
command -v dsh
ps -o pid,lstart,cmd -p 19488
ls -d /home/fares/.nvm/versions/node/*/lib/node_modules/@deepseek-ai/dsh
npm view @deepseek-ai/dsh version
npm view @deepseek-ai/dsh@0.1.1-rc.2 dist.integrity
npm view @deepseek-ai/dsh@0.2.1-rc.2 dist.integrity

# PATH A, exactly as §N9 writes it
npm install --save-exact @deepseek-ai/dsh@0.1.1-rc.2
sha256sum package-lock.json
npm install --save-exact --offline @deepseek-ai/dsh@0.2.1-rc.2
sha256sum package-lock.json

# the probe, against the first pinned install
node scripts/dsh-compat-probe.mjs --require \
  --json reports/dsh-compat-probe-0.1.1-rc.2-pinned.json \
  --expect-version 0.1.1-rc.2

# the probe, against the version the host runs
node scripts/dsh-compat-probe.mjs --require \
  --json reports/dsh-compat-probe-0.2.1-rc.2-host.json \
  --project-root /home/fares/.nvm/versions/node/v26.12.0/lib \
  --expect-version 0.2.1-rc.2 \
  --lockfile "$PWD/package-lock.json" \
  --expected-integrity "$(npm view @deepseek-ai/dsh@0.2.1-rc.2 dist.integrity)" \
  --integrity-source manual-npm-view

# the probe, against the install this repository now pins
node scripts/dsh-compat-probe.mjs --require \
  --json reports/dsh-compat-probe-0.2.1-rc.2-pinned.json \
  --expect-version 0.2.1-rc.2

# the probe's own tests
npx vitest run tests/unit/dsh-compat-probe.test.ts

# the gates
npm run verify
```
