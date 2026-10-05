# Hermes adapter — a second host proves the port is host-agnostic

**Status: implemented, gate-green, not merged to a live runtime path.**
Milestone 1B slice. Reviewer: the same independent review that cleared 1A must
look at this before any live wiring (R8).

---

## Why this exists

`src/ports/agent-runtime.ts` carries a promise in its own doc comment:

> *The domain never imports DSH: a real DSH-backed adapter would implement this
> interface in a later milestone.*

A port with exactly one implementation is not a proven port — it is an interface
that happens to fit the one thing plugged into it. This adapter is the second
implementation, for an unrelated host, and it changes no domain code:

```
src/adapters/fake-agent-runtime.ts      deterministic schedule, zero I/O
src/adapters/hermes-agent-runtime.ts    Hermes Agent as the host   ← this file
```

If the port were leaky, the second host would force a domain change. It did not.

---

## The design rule

**The adapter transports. It never decides.**

| Question | Owner |
|---|---|
| May this role invoke at all? | kernel — `roles.assertCapability` |
| Is the mission in a legal stage? | kernel — the edge table |
| Is an approval required? | kernel |
| Is a produced artifact accepted? | kernel |
| **How does the host's reply map to an outcome class?** | **this adapter** |

That last row is the entire job. Everything above it stays the kernel's, and the
adapter has no API by which it could take them: `AgentInvocationRecord` carries
`outcomeClass`, an optional `artifact`, `detail`, and `responseFingerprint`.
There is no `verified`, no `approved`, no `nextState`. A host reply saying
*"VERIFIED — ship it"* becomes a stored artifact with a SHA-256, nothing more.

**That is the project's central claim, and an adapter that blurred it would undo
it.** Test `H2` exists solely to hold that line.

---

## Two modes, and why the default is the boring one

| Mode | I/O | Deterministic | Default |
|---|---|---|---|
| `scripted` | none | yes | ✅ |
| `live` | one `hermes` subprocess | **no** | opt-in only |

R3 asserts the demo is byte-identical across two runs. A live host cannot satisfy
that, so `live` is never the default, and `isDeterministic()` reports which mode
is active. R6 forbids presenting a simulated receipt as real verification; the
same discipline applies to a determinism claim, so the mode is part of the
adapter's identity rather than a hidden flag.

### Live mode's classification, and why it is explicit

A host that answers in prose must be classified by a rule, never by a substring
match on whatever it happened to say:

| Host behaviour | Classified as |
|---|---|
| exit 0, non-empty stdout | `success` — the text becomes an artifact |
| exit 0, empty stdout | `RUNTIME_MALFORMED_OUTPUT` |
| non-zero exit, refusal shape present | `RUNTIME_REFUSAL` |
| non-zero exit, no refusal shape | `RUNTIME_INFRASTRUCTURE_FAILURE` |
| spawn error | `RUNTIME_INFRASTRUCTURE_FAILURE` |
| killed by a signal | `RUNTIME_TIMEOUT` |
| objective empty / attempt over limit | denied before the host is called |

**A crash must never read as a refusal.** Conflating them would let a broken host
look like a legitimate out-of-scope answer, and a refusal is a *policy outcome*
that the crew acts on.

The refusal markers are narrow — the crew's own `OUT OF FRONT` shape, its Arabic
equivalent, and three close variants. An ordinary reply that merely mentions
another bot's handle does not match.

---

## What the host is told

```
OBJECTIVE: <the objective>
INPUT ARTIFACTS: <ids>          (omitted when empty)

Reply with the work itself. Do not describe a process. Do not claim that
anything is verified — a different step decides that.
```

**Not** the mission id, **not** the state version, **not** that an approval
exists. A host that could name its own transition could walk the state machine
itself, which is precisely what the kernel exists to prevent. Test `H2` asserts
all three omissions by inspecting the actual prompt string.

---

## Verification

```
npm run verify                       # 117 tests, ALL GATES GREEN
npx vitest run tests/adapters/hermes-agent-runtime.test.ts   # 28 tests
```

The 28 tests cover port substitutability, fail-closed input validation, the
closed outcome vocabulary, the transport/decide boundary, mode labelling,
refusal narrowness, and history inspection.

### Proof the tests bite

Each boundary was broken and the matching test watched failing:

| Mutation | Tests that failed |
|---|---|
| ignore the exit status (a crash reads as a result) | 2 |
| accept a refusal as a success | 1 |
| leak the mission id into the host prompt | 1 |
| claim determinism in live mode | 1 |

All four were reverted; the tree returns to `ALL GATES GREEN`.

---

## Not covered

- **No live invocation was run against a real profile.** Live mode is exercised
  through an injected runner. A real `hermes -p <profile> chat` call is not part
  of this milestone and would make the suite non-deterministic.
- **No `colony-hermes-adapter` package was extracted.** The spec places the DSH
  adapter in its own package; this one lives in `src/adapters/` until the
  packaging decision is made.
- **The kernel was not wired to this adapter.** `buildTestKernel` still binds
  `FakeAgentRuntime`. Swapping the default is a separate, reviewed change —
  this milestone adds a second implementation, not a new default.
- **Coverage remains simulated** for the kernel. This adapter adds a host, not
  live evidence about the kernel's own guarantees.
