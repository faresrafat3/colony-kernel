# DSH runtime pin: plan and decision record

**Status: the version is decided and the pin moves forward; the `package.json`
change lands in the commit that follows the one that adds the probe.** This
document is the plan the normative specification asks for (v0.1.1 §N9: *"Details
and decision record: `dsh-runtime-pin-plan.md`"*), plus the decision record to
date. No adapter work depends on it yet, and nothing in this repository
imports DSH.

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

Measured on the host on **2026-10-20**, not copied from the specification.
Re-measured: the host was restarted at 17:29 that day and moved again, so an
earlier table in this document (which said `0.2.0-rc.2` on Node v26.8.2) is
stale.

| What | Value |
|---|---|
| Installed package | `@deepseek-ai/dsh` **0.2.1-rc.2** |
| Install path | `/home/fares/.nvm/versions/node/v26.12.0/lib/node_modules/@deepseek-ai/dsh` |
| Entry | `lib/bin.js` (11772 bytes, sha256 `80112efe368efb1a39720c7ada0af00442e5131fb2744edaaff8a3e8bb499e6f`) |
| `dsh` on PATH | `/home/fares/.nvm/versions/node/v26.12.0/bin/dsh` → the same `lib/bin.js` |
| The running host process | pid 19488, started 2026-10-20 17:29:42, `node …/v26.12.0/bin/dsh web --no-open --port 3080` |
| Node on PATH | `v26.12.0`; npm `12.2.0` |
| An older install, still on disk | `0.2.0-rc.2` at `/home/fares/.nvm/versions/node/v26.8.2/lib/node_modules/@deepseek-ai/dsh` — it is not the one running |
| Registry | `latest` = `0.2.1-rc.2`, `next` = `0.2.1-rc.2`, `alpha` = `0.2.1-alpha.5`; `0.1.1-rc.2` is still published |

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

**Which version to pin: decided by the probe, on the record.** The
specification's adapter contract (v0.1.1 §N9) was written against `0.1.1-rc.2`,
and that version is still published, so it could be pinned exactly. The host
runs `0.2.1-rc.2`.

The rule this document proposed, now executed:

1. Pin **`0.1.1-rc.2`** first (the version the adapter contract was derived
   from) so the first adapter milestone is tested against the specification it
   implements. — **Done.** `npm install --save-exact @deepseek-ai/dsh@0.1.1-rc.2`,
   commit `60d52fe`; lockfile sha256
   `5a490581d574512c3136ec984460e1e365b01dc27b70e855679bb54ce48e749c`.
2. Then probe the version the host actually runs and record the result. If the
   probe passes, the pin moves forward explicitly, with the probe output as
   the evidence. If it fails, the difference is a finding, not a reason to
   widen the pin silently. — **Done.** The probe
   (`scripts/dsh-compat-probe.mjs`) passed against `0.1.1-rc.2`
   (`reports/dsh-compat-probe-0.1.1-rc.2-pinned.json`, 33/33 surfaces, exit
   `0`) and against the host's `0.2.1-rc.2`
   (`reports/dsh-compat-probe-0.2.1-rc.2-host.json`, 33/33 surfaces, exit
   `0`). It passed, so the pin moves forward explicitly.
3. Do not pin `latest`. A pin that moves by itself is not a pin. — **Held.**
   The pin is the literal exact string `0.2.1-rc.2`, written by `--save-exact`.
   That version happens to be npm's `latest` tag today; the dependency does
   not name the tag, the lockfile pins the tarball's SHA-512 integrity, and
   the probe fails if the installed bytes are not those bytes.

**The pin is `0.2.1-rc.2`**, an exact version, the one the host runs and the
one the probe exercised. The reasoning and the evidence are in
`docs/dsh-compatibility-evidence.md` §5.

The probe is what makes the version choice safe: no version could be
certified as compatible while §N9's compatibility probe did not exist, so
pinning one would only have frozen an unverified claim. Now the probe exists,
it runs, and its output is the record.

## What executing PATH A produces (the acceptance evidence)

1. The Colony package root with `@deepseek-ai/dsh` as an **exact**
   (`--save-exact`) dependency at the pinned version. — **Done** (the version
   moved forward in the follow-up commit; see the decision above).
2. A committed `package-lock.json` whose SHA-256 is recorded in the adapter
   manifest. — **Half done.** The lockfile is committed and its SHA-256 is
   measured; the manifest that would carry it does not exist yet, because it
   ships with the M2 adapter.
3. A compatibility probe (v0.1.1 §N9) that runs at startup against that
   pinned install and **fails the startup** when a required symbol, service or
   event is missing. — **Done**, as a standalone module
   (`scripts/dsh-compat-probe.mjs`) that the adapter will call at startup:
   33 required surfaces, `--require` exits non-zero with a loud named failure,
   `--json` writes the receipt.
4. The probe's recorded output, the receipt that the pinned runtime was
   actually exercised, not asserted. — **Done.** Two receipts in `reports/`,
   one per version, each recording its command and its exit status.

## What the pin does not do

- It does not certify M2. R8's review gate applies to the adapter itself; see
  `docs/colony-independent-review-protocol.md`.
- It does not make the runtime portable. PATH A pins *a* known runtime; the
  probe is what turns a version mismatch into a loud startup failure instead
  of a silent behaviour change.
- It does not touch Colony's persisted records. Schema versioning and the
  migration engine are M1B, tracked in `docs/IMPLEMENTATION_STATUS.md`.

## Still unestablished

- **The adapter manifest** that would carry the lockfile hash. It ships with
  the M2 adapter, which does not exist yet. The hash the manifest will need is
  measured and recorded in the probe's receipt.
- **The adapter itself.** The probe is standalone until the adapter calls it
  at startup; no Colony code imports DSH, and the adapter still needs its own
  review under R8.
- **§N9 requirements 5–10**, which are adapter-side obligations (reversible
  lifecycle registrations, unload removing listeners, event translation,
  unknown-event handling, and the upgrade-requires-tests rule). The probe
  answers requirements 1–4.
- **The DSH-mapping reference M08** that the specification cites. It is not
  in this repository, so the probe's requirement list was derived from §N9's
  own interface list and the installed package's public surface instead.
