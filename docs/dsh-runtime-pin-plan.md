# DSH runtime pin: plan and decision record

**Status: the pin is NOT established.** This document is the plan the
normative specification asks for (v0.1.1 §N9: *"Details and decision record:
`dsh-runtime-pin-plan.md`"*), plus the decision record to date. No adapter
work depends on it yet, and nothing in this repository imports DSH.

The Owner ratifies; this document proposes (see `~/Projects/README.md`,
"Owner ratifies — the Owner is the terminus of every appeal; agents propose").

## What has to be pinned, and why

The kernel must run against a *known* DSH runtime. Two independent axes move:
the DSH version, and the Colony schema version. The specification keeps them
separate on purpose (v0.1.1 §N1.9): "DSH pins and Colony schema versions are
independent axes". Pinning DSH therefore says nothing about migrating Colony
records, and a DSH upgrade never silently migrates anything.

Without a pin, "the adapter works" is a claim about whatever version happened
to be installed. That is the false-success failure this whole project exists
to prevent, applied to the runtime instead of the agent.

## Current observed runtime

Measured on the host on **2026-10-20**, not copied from the specification:

| What | Value |
|---|---|
| Installed package | `@deepseek-ai/dsh` **0.2.0-rc.2** |
| Install path | `/home/fares/.nvm/versions/node/v26.8.2/lib/node_modules/@deepseek-ai/dsh` |
| Entry | `lib/bin.js` |
| `dsh` on PATH | `/home/fares/.nvm/versions/node/v26.8.2/bin/dsh` → the same `lib/bin.js` |
| Registry | 36 published versions; `latest` = `0.2.1-rc.2`; `0.1.1-rc.2` is still published |

The specification recorded a different observation when it was written
(v0.1.1 §N9: `0.1.1-rc.2` at `/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js`,
no lockfile). That record is normative history and is not edited (R5); the
drift is recorded here instead. The host moved from a system-wide install to
an nvm-managed one, and the installed version moved with it.

**Consequence:** the version named in the specification is not the version on
the host, and neither is the registry's latest. A pin has to name one of them
explicitly.

## The two allowed paths (from the specification, quoted)

**PATH A (preferred): isolated project-local exact installation.** Create the
Colony package root; `npm install --save-exact @deepseek-ai/dsh@<version>`;
commit `package-lock.json`; record the lockfile's SHA-256 in the adapter
manifest. The runtime compatibility probe runs at startup against this pinned
install.

**PATH B: temporary offline snapshot.** Archive the installed DSH package and
its transitive dependency tree; generate an exact package manifest/SBOM;
record a SHA-256 per file; treat it as non-portable and temporary. PATH B is a
stopgap only if PATH A's install fails offline, and it must be replaced by
PATH A before Milestone 2.

## Decision

**PATH A.** The registry serves exact versions (measured above), so the
preferred path is available and PATH B's stated purpose, an offline stopgap,
does not arise. PATH B also produces a non-portable artifact, which is the
opposite of what a pin is for.

**Which version to pin: open, with a proposal.** The specification's adapter
contract (v0.1.1 §N9) was written against `0.1.1-rc.2`, and that version is
still published, so it can be pinned exactly. The host runs `0.2.0-rc.2`.

The proposal, for the Owner's ratification:

1. Pin **`0.1.1-rc.2`** first (the version the adapter contract was derived
   from) so the first adapter milestone is tested against the specification it
   implements.
2. Then probe **`0.2.0-rc.2`** (what the host actually runs) and record the
   result. If the probe passes, the pin moves forward explicitly, with the
   probe output as the evidence. If it fails, the difference is a finding, not
   a reason to widen the pin silently.
3. Do not pin `latest`. A pin that moves by itself is not a pin.

The probe is what makes the version choice safe to defer: until §N9's
compatibility probe exists, no version can be certified as compatible, so
pinning one now would only freeze an unverified claim.

## What executing PATH A produces (the acceptance evidence)

1. The Colony package root with `@deepseek-ai/dsh` as an **exact**
   (`--save-exact`) dependency at the pinned version.
2. A committed `package-lock.json` whose SHA-256 is recorded in the adapter
   manifest.
3. A compatibility probe (v0.1.1 §N9) that runs at startup against that
   pinned install and **fails the startup** when a required symbol, service or
   event is missing.
4. The probe's recorded output, the receipt that the pinned runtime was
   actually exercised, not asserted.

## What the pin does not do

- It does not certify M2. R8's review gate applies to the adapter itself; see
  `docs/colony-independent-review-protocol.md`.
- It does not make the runtime portable. PATH A pins *a* known runtime; the
  probe is what turns a version mismatch into a loud startup failure instead
  of a silent behaviour change.
- It does not touch Colony's persisted records. Schema versioning and the
  migration engine are M1B, tracked in `docs/IMPLEMENTATION_STATUS.md`.

## Still unestablished

- The pinned version (above: proposed `0.1.1-rc.2`, not ratified).
- The adapter manifest that would carry the lockfile hash. It ships with the
  M2 adapter, which does not exist yet.
- The compatibility probe itself (§N9), which lands with the adapter.
