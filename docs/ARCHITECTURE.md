# Architecture — Colony Kernel Milestone 1A

```
colony-kernel/
  src/
    domain/            # pure: no I/O, no DSH, no platform globals
      mission/         # 22-stage enum, MissionState, single-truth edge table + renderers
      events/          # closed 40-type vocabulary, EventEnvelope, applyEvent reducer
      approvals/       # ApprovalRequest/ApprovalRecord, JCS subject hash, binding rules
      budgets/         # BudgetLedger, reserve/settle/release/top-up, invariants
      artifacts/       # ArtifactManifest + content addressing
      revisions/       # RevisionRequest, bounded-rework dedupe key
      capabilities/    # RoleManifest/CapabilityManifest, deny-by-default registry
      canonical/       # RFC 8785 JCS canonicalization
      errors/          # KernelError codes + Result type
      support/         # pure TypeScript SHA-256 (no node:crypto)
    application/
      colony-kernel.ts # command/query seam; legality-before-storage; atomic commits
    ports/             # Colony-owned interfaces (agent-runtime, storage, clock, hash, ids, telemetry)
    adapters/          # in-memory storage, fake runtime, deterministic clock/ids/hasher/telemetry
    testing/builders/  # deterministic test kernel + mission fixtures
    demo/run-demo.ts   # seeded deterministic demo mission
  tests/
    transitions/ contracts/ security/ recovery/ unit/
  docs/ reports/
```

## Layering rules (enforced by review, not by a build tool in M1A)

1. `domain/**` imports nothing outside `domain/**`. No `node:*`, no network, no
   process, no clock reads, no randomness.
2. `application/**` depends on domain types plus Colony-owned ports only.
3. `adapters/**` implement ports. Swapping the in-memory storage for a SQLite
   adapter is the M1B slice and touches no domain code.
4. Adapters are the only place with side effects (they still perform none in
   M1A: the fake runtime and in-memory storage do zero I/O).

## Control flow of one command

`ColonyKernel.<command>()`
→ role/capability check (registry, deny-by-default)
→ read current `MissionState`
→ build event(s) with injected clock + deterministic IDs + canonical payload hash
→ **pre-validate by pure `applyEvent` on the current state** (legality precedes
   storage uniqueness; failures become durable rejections with no mutation)
→ `storage.atomicApply(missionId, events, expectedStateVersion, applyEvent)`
   stages event-append + state CAS + unique constraints in one transaction and
   rolls back fully on any failure
→ telemetry record → return new state / receipt.

## Event and state invariants

- Every accepted event increments `stateVersion` **exactly once** and
  `missionSequence` exactly once (asserted inside the storage commit).
- Uniqueness: `eventId`, `(missionId, missionSequence)`, scope-qualified
  `idempotencyKey` — all committed with the state update.
- Reduction is pure; replaying the full stream from a seed reproduces the stored
  state exactly (H-01/H-04).
- `PUBLIC_ACTION_*` events always fail closed with `PUBLICATION_DISABLED`, and no
  edge enters `PUBLIC_ACTION_PENDING`/`PUBLISHED` (A33).

## Single source of truth for the state machine

`domain/mission/state-machine.ts` holds one declarative `EDGES` table (with
payload/state narrowing predicates) plus the stage-agnostic nonterminal and pause
blocks. Runtime validation (`decideTransition`), the human-readable table
(`renderTransitionTable`) and the Mermaid diagram (`renderMermaidStateDiagram`)
are all generated from it — there is no second, hand-maintained state list.