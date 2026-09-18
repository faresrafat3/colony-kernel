# CK-002 — implementation handoff (v0.1.1)

## Start here

Build **Milestone 1 only** from the [normative Colony Kernel v0.1.1 specification](colony-kernel-v0.1.1.md). v0.1.1 supersedes v0.1 for new work; the [v0.1 specification](colony-kernel-v0.1.md) remains byte-identical as normative history, and the [delta document](colony-kernel-v0.1-to-v0.1.1-delta.md) lists every change. The approved direction is unchanged: DSH runtime + deterministic TypeScript Kernel, no LangGraph. This handoff is a build brief, not a claim that anything is implemented.

Implementation status for every acceptance criterion is **NOT_STARTED** — that is the expected starting point, not a gap in this handoff.

Read the [runtime pin plan](dsh-runtime-pin-plan.md) before any native adapter work, and the [independent review protocol](colony-independent-review-protocol.md) for the post-implementation review gate. Existing experiments remain stopped; source mirrors and profile configurations remain unchanged.

## Ordered implementation slices (updated for v0.1.1)

1. **Contracts, envelopes and command seam.** Closed schemas for all 14 persisted types (N5), the 40-type closed event vocabulary (N2), ApprovalRequest/ApprovalRecord with content-addressed subjects (N1), canonical serialization (RFC 8785). `InMemoryColonyStorage` first. Done: A04, A05, A08, A10–A12 pass through public interfaces on in-memory storage.
2. **Storage adapter and apply-once events.** `SQLiteColonyStorage` with the full ColonyStorage contract (N7): CAS on mission state, unique eventId/missionSequence/idempotencyKey constraints, atomic event+state commit (atomicApply), leases, immutable finalized artifacts. Done: A09, A23–A26 pass with injected crash points and temporary directories.
3. **Tool invocation ledger and crash matrices.** Transactional outbox (N3), ToolResultReceipt dedupe by (invocationId, resultHash), side-effect-class recovery rules, OUTCOME_UNKNOWN → RECONCILIATION_REQUIRED. Done: A13, A22, A25 crash-matrix tests pass with fake runtime.
4. **Budget ledger.** Per-resource-class BudgetLedger (N4) with CAS reservations, restricted top-ups, settlement/release semantics. Done: A21 concurrency and immutability tests pass.
5. **Bounded rework and state machine.** 22-state machine with terminal/pause semantics (N10), RevisionRequest counters (N6), HUMAN_REVIEW_REQUIRED exhaustion paths. Done: A01–A03, A14–A20 pass using fake runtime.
6. **Gates and approvals.** Content-addressed approval binding (N1), transactional expiry, replay/purpose checks, HumanAuthorityRecord. Done: A05–A07, A33–A34 pass with injected test identity.
7. **Workspace isolation.** Per-mission workspace layout (N8) with path/traversal/symlink rejection and content-addressed promotion. Done: workspace-escape tests pass.
8. **Native host plugin shell.** colony-dsh-adapter with lifecycle disposers, compatibility probe (N9). Done: typecheck and A29 lifecycle test pass. Do not edit shipped compositions or mount into the user's GUI.
9. **Evidence and demo.** Deterministic simulated mission through both human gates, a revision, restart-at-gate and reconciliation. Report records exact commands, actual outputs, fixture designation, remaining limitations. No simulated receipt may be labelled real verification.

Use the same public command/query testing seam as v0.1. Test-first vertical slices; each failing assertion is observed before implementation. Do not commit the parent home directory.

## Expected outputs of the future implementation

- Buildable TypeScript package with an exact dependency lock (PATH A of the pin plan) or documented PATH B snapshot.
- Kernel public interface, 14 closed schemas, 22-state machine, apply-once event store, ledger, registry, gates, fake runtime, deny-publication adapter.
- Crash-matrix, migration-policy, workspace-escape and bounded-rework test coverage.
- README distinguishing simulated / native-adapter / isolated-runner / live-role coverage.

The A01–A35 set is a roadmap, not all Milestone 1 claims. Real filesystem enforcement (A17), serving-model prompt behavior (A28), live DSH admission (A30), external isolation (A31), ten real dry runs (A32) and real backup restoration (A35) require later integration evidence. Skeleton tests may simulate those contracts but must label the limitation.

## Stop conditions

Milestone 1 ends at a passing deterministic skeleton with a disposable native shell. No live models, role migration, container deployment, web/GitHub access, public actions (disabled per Captain decision) or production UI without separate authorization. Public-action states PUBLIC_ACTION_PENDING/PUBLISHED must not be entered; attempts return PUBLICATION_DISABLED.

The DSH pin remains unestablished until PATH A or PATH B is executed under a later authorization. A fake-runtime skeleton can be built without it; live DSH integration requires the accepted pin plus adapter conformance evidence first.

## Specification verification status

The v0.1.1 document bundle passes structural validation (`review-packet-v0.1.1/validation-report.json`); v0.1 documents are byte-identical to their pre-revision hashes. No Kernel source, runtime integration, real dry run or independent review exists. The independent review protocol has not been executed; its review gate must pass before any claim beyond "specification complete".
