---
kind: spec
status: ready-for-agent
created: 2026-09-17
id: CK-002
version: 0.1.1
supersedes: CK-001
---

# Colony Kernel v0.1.1 — deterministic mission control on DeepSeek Harness

## Problem Statement

v0.1 defined the direction but left approval subjects, event vocabulary, crash-dedupe, budget ledger, migration policy, rework bounds and terminal-state semantics as policy gaps. An implementer would have to invent security-relevant policy (which the specification explicitly forbids silently deciding).

## Solution

v0.1.1 repairs those gaps as a normative specification only. It introduces the four-axis evidence model (spec/test/DSH-mapping/implementation), content-addressed approvals, a closed apply-once event vocabulary, transactional tool-invocation/outbox semantics, a non-monotone reservation ledger, per-type schemaVersion + forward-only migration, structured bounded rework, a ColonyStorage capability contract, per-mission workspace/isolation rules, a DSH adapter boundary with two pin paths, and a 22-state machine. All statuses use explicit axes. Implementation has not started; implementation_status=NOT_STARTED everywhere and that is not a specification failure. Public writes remain disabled per Captain decision; reserved future-publication states are explicitly exempt from reachability.

**Normative language:** MUST is required; SHOULD requires a documented exception; MAY is optional. Every transition or capability not explicitly allowed is denied. The repaired normative contracts follow.

## Normative Contracts

### N1. Approval subject binding

Content-addressed, transition-bound, race-safe approval.

`ApprovalRequest` (schemaVersion starts at 1) fields: `approvalRequestId` (host-generated UUID), `schemaVersion`, `missionId`, `missionStateVersion`, `requestedTransition` `{fromState,toState}`, `approvalPurpose` (enum: PLAN_APPROVAL, PACKAGE_APPROVAL, BUDGET_TOPUP), `actionClass` (enum: LOCAL_READ, LOCAL_WRITE, PUBLIC_WRITE, BUDGET), `requestedByRole` (roleId+roleVersion), `requiredHumanAuthority` (identity reference, never a bearer token), `artifactSubjects[]` (`artifactId`,`artifactType`,`artifactSchemaVersion`,`contentSha256`,`finalizedAt`), `policyVersion`, `roleVersions`, `issuedAt`, `expiresAt`, `nonce` (host-random ≥128 bits). Requirements:

1. `artifactSubjects` sorted canonically by `(artifactType, artifactId)`.
2. Canonical serialization = RFC 8785 JCS of the request object; UTF-8.
3. `approvalSubjectHash` = SHA-256 over canonical bytes.
4. `ApprovalRecord` references `approvalSubjectHash`.
5. Any artifact-content change → new `contentSha256` → different hash → stale.
6. Any `missionStateVersion` change → stale.
7. Purpose/actionClass must match the consuming transition exactly; approval cannot authorize another purpose.
8. Expiry is checked transactionally at commit against the Kernel persistence-layer clock; if `expiresAt <= commitTime`, reject EXPIRED. Reading alone never authorizes.
9. Replay against a different missionId fails (missionId is inside the hashed subject).
10. A role MUST NOT approve its own output; the requested role identity is recorded and checked at consumption.
11. Rejection and expiration are durable ApprovalRecords/events, never deletions.

`ApprovalRecord` fields: `approvalRecordId`, `schemaVersion`, `approvalRequestId`, `approvalSubjectHash`, `decision` (APPROVED|REJECTED), `decidedBy` (authenticated human authority reference; agent identity invalid), `decidedAt`, `authorityProof` (transport-authenticated proof, no bearer token in any prompt/session/artifact), `optionalReason`. Duplicate identical decision = idempotent replay of record; contradictory decision at same request = CONFLICT. An APPROVED record is consumed at most once; consumption is transactional with the transition commit. Events: APPROVAL_REQUESTED, APPROVAL_RECORDED, APPROVAL_EXPIRED.

Examples:
- **Valid:** request over candidate+plan+verification artifact subjects, hash H, Captain approves at t<TTL; transition IMPLEMENTATION acceptance consumes record once.
- **Stale after artifact modification:** new candidate changes `contentSha256`; old approval's hash ≠ current subject hash → STALE_APPROVAL, rejected transactionally at commit.
- **Replay to another mission:** same approvalSubjectHash bytes replayed with different missionId → missionId mismatch inside canonical bytes → UNAUTHORIZED; durable rejection record.
- **Expired during race:** two concurrent transactions validate at the same read time; only the one whose commit timestamp ≤ expiresAt commits; the other gets EXPIRED_AT_COMMIT and a durable APPROVAL_EXPIRED record.
- **PLAN applied to PUBLISH:** approvalPurpose=PLAN_APPROVAL cannot satisfy a PACKAGE_APPROVAL transition; INVALID_PURPOSE rejection, durable record.

### N2. Event envelope and apply-once semantics

`EventEnvelope` (schemaVersion 1): `eventId` (host UUID), `schemaVersion`, `eventType` (closed vocabulary below), `missionId`, `missionSequence` (per-mission monotone, starts 1), `expectedStateVersion` (state version before application), `actor` (`actorType`: CAPTAIN_TRANSPORT|TRUSTED_SCHEDULER|KERNEL_POLICY|RUNTIME_ADAPTER|TRUSTED_RUNNER|ADMITTED_INVOCATION; `actorId`; `roleId`; `roleVersion`), `causationId`, `correlationId`, `idempotencyKey` (scope-qualified), `occurredAt`, `recordedAt`, `payload` (closed per-type schema), `payloadSha256` (canonical payload hash).

Uniqueness (all in the same commit as state update):
- `eventId` globally unique (unique index).
- `missionId + missionSequence` unique.
- `idempotencyKey` unique within its action scope (e.g. `approval:<approvalRequestId>`, `tool:<invocationId>:<attempt>`, `budget:<reservationId>:settle`).

Closed v0.1.1 vocabulary (40 event types; unknown type → fail closed):
- Mission lifecycle: MISSION_CREATED, MISSION_ABORTED, MISSION_FAILED, MISSION_CLOSED
- Policy: POLICY_SCREEN_STARTED, POLICY_SCREEN_COMPLETED
- Recon: RECON_STARTED, RECON_COMPLETED
- Planning: PLAN_PROPOSED, PLAN_CHALLENGED, PLAN_REVISED
- Approvals: APPROVAL_REQUESTED, APPROVAL_RECORDED, APPROVAL_EXPIRED
- Execution: IMPLEMENTATION_STARTED, IMPLEMENTATION_COMPLETED, REVISION_REQUESTED, REVISION_COMPLETED
- Quality: VERIFICATION_COMPLETED, TECHNICAL_REVIEW_COMPLETED, DOCUMENTATION_COMPLETED, FINAL_GATE_COMPLETED
- Artifacts: ARTIFACT_FINALIZED, ARTIFACT_REJECTED
- Tools: TOOL_INVOCATION_PREPARED, TOOL_INVOCATION_DISPATCHED, TOOL_INVOCATION_SETTLED, TOOL_INVOCATION_FAILED, TOOL_INVOCATION_OUTCOME_UNKNOWN
- Public actions: PUBLIC_ACTION_PREPARED, PUBLIC_ACTION_DISPATCHED, PUBLIC_ACTION_RECONCILED, PUBLIC_ACTION_FAILED
- Budgets: BUDGET_RESERVED, BUDGET_SETTLED, BUDGET_RELEASED, BUDGET_TOPUP_APPROVED
- Checkpoints: CHECKPOINT_WRITTEN, RECOVERY_STARTED, RECOVERY_COMPLETED

Apply-once contract:
1. Reduction is deterministic and side-effect free (pure function of state+event).
2. Re-applying an `eventId` returns ALREADY_APPLIED (no state change, not an error for delivery retry).
3. Duplicate delivery cannot increment missionSequence.
4. `expectedStateVersion` must match current state version.
5. Mismatch → CONCURRENCY_CONFLICT, no effects.
6. Recording event + state update in one storage transaction (ColonyStorage.atomicApply).
7. Illegal transitions reject the event without state change; durable rejection audit.
8. Every accepted event increments stateVersion exactly once.
9. Unknown event types fail closed (INVALID_SCHEMA family), no partial application.
10. Unsupported event schemaVersion fails closed, read-only diagnostic.

### N3. Tool execution and crash dedupe

`ToolInvocation` (schemaVersion 1): `invocationId`, `schemaVersion`, `missionId`, `roleId`, `toolId`, `capabilityId`, `inputArtifactHash`, `idempotencyKey`, `riskClass`, `sideEffectClass` (NONE|LOCAL_REVERSIBLE|EXTERNAL_IDEMPOTENT|EXTERNAL_NON_IDEMPOTENT), `status` (PREPARED|DISPATCHED|SETTLED|FAILED|OUTCOME_UNKNOWN|RECONCILIATION_REQUIRED), `attempt`, `maximumAttempts`, `preparedAt`, `dispatchedAt`, `settledAt`.

Execution sequence (normative):
1. Validate capability + budget reservation.
2. Persist TOOL_INVOCATION_PREPARED transactionally (outbox row + ledger reservation in same commit).
3. Commit.
4. Dispatch outside the state transaction, carrying invocationId+idempotencyKey.
5. Persist result (ToolResultReceipt) or OUTCOME_UNKNOWN transactionally with status change.
6. Apply the result through an idempotent event (TOOL_INVOCATION_SETTLED/FAILED/OUTCOME_UNKNOWN) keyed by `idempotencyKey`.

ToolResultReceipt: `receiptId`, `invocationId`, `attempt`, `resultHash` (canonical receipt hash), `sideEffectClass`, `externalIdempotencyMarker` (when supported), `structuredFields` (exit codes, byte counts, digests — never prose-only), `recordedAt`. Requirements:
- Dedupe by `(invocationId, resultHash)`; the same result cannot advance state twice (second delivery returns the first settlement's event).
- Crash after dispatch before settlement: for EXTERNAL_NON_IDEMPOTENT, recovery MUST NOT blind-retry; status → RECONCILIATION_REQUIRED and a human decision is required before any redispatch. For EXTERNAL_IDEMPOTENT, recovery may re-dispatch with the same idempotencyKey only after query-before-retry confirms no external effect. For LOCAL_REVERSIBLE, rollback or re-run after quiescence is allowed. For NONE, retry freely after quiescence.
- Public writes (disabled in v0.1.1; see §States) additionally require a stable externally visible idempotency marker when the target supports it; query-before-retry is mandatory when it does not; if outcome stays indeterminate → RECONCILIATION_REQUIRED (never auto-retry).
- Model-generated text can never be proof a tool succeeded; only a structured ToolResultReceipt advances state.
- Crash matrices (all four crash points + duplicate delivery + repeated recovery):

| Crash point | PREPARED | DISPATCHED | SETTLED | State | Recovery obligation |
|---|---|---|---|---|---|
| before PREPARED commit | — | — | — | no invocation row | nothing persisted; retry is a fresh PREPARED |
| after PREPARED, before dispatch | yes | no | no | invocation PREPARED, no dispatch | recovery re-dispatches safely (same idempotencyKey); allowed for all classes because no external effect began |
| after dispatch, before settlement | yes | yes | no | unknown outcome | query-before-retry; EXTERNAL_NON_IDEMPOTENT → RECONCILIATION_REQUIRED, no blind retry; EXTERNAL_IDEMPOTENT → same-key re-dispatch after query; LOCAL_REVERSIBLE → rollback then retry fresh; NONE → retry fresh after quiescence |
| after settlement, before state reduction | yes | yes | yes | settlement event pending | replay settlement event idempotently; dedupe by (invocationId, resultHash) |
| duplicate result delivery | any | any | any | no change | ALREADY_APPLIED / same receipt returned; no second state advance |
| repeated recovery process | any | any | any | idempotent | recovery itself is idempotent; no duplicate events |

### N4. Budget ledger semantics

`BudgetLedger` (schemaVersion 1) per mission and resource class: `immutableLimit`, `approvedTopUps` (append-only, each referencing its APPROVAL_RECORD), `reserved`, `spent`, `releasedReservations`, `remainingCapacity = effectiveLimit − reserved − spent` where `effectiveLimit = immutableLimit + Σ approvedTopUps`.

Invariants:
1. `spent` monotonic nondecreasing.
2. `immutableLimit` immutable (any attempt to mutate it → INTEGRITY_FAILURE, durable event).
3. Top-ups require a separate human-approved event (BUDGET_TOPUP_APPROVED) referencing an ApprovalRecord with approvalPurpose=BUDGET_TOPUP.
4. `effectiveLimit = immutableLimit + Σ approvedTopUps`.
5. `reserved ≥ 0`.
6. `spent ≥ 0`.
7. `spent + reserved ≤ effectiveLimit` at every commit.
8. Settlement transfers amount from `reserved` to `spent` (atomic).
9. Cancellation releases reservation without reducing spent.
10. `remainingCapacity` increases only via reservation release or approved top-up.
11. No role can approve its own budget top-up (human-only; role that triggered the request is recorded and barred from approving).
12. Every reservation uses compare-and-swap (or equivalent transactional conflict) on `(missionId, resourceClass)` state.
13. Separate resource classes: model tokens, wall-clock time, tool calls, monetary cost, revision cycles. Each has its own ledger row; a top-up on one class does not affect others.
14. Exceeding any hard budget blocks further execution and records a durable event (BUDGET_EXCEEDED incident).

Resource classes and top-up policy (Captain-approved): token, monetary, tool-call, and execution-time budgets MAY be topped up; revision/retry/rework/resumption counters MUST NOT be topped up and never reset.

Examples:
- Reserve 1000 tokens for an invocation → BUDGET_RESERVED, reserved=100. Settle actual 800 → reserved −=100, spent +=800, BUDGET_SETTLED; remaining = limit−800.
- Cancellation → BUDGET_RELEASED, reserved −=unused, spent unchanged.
- Two concurrent reservations totalling more than remaining: one CAS succeeds, other CONCURRENCY_CONFLICT (no overspend).
- Top-up: Captain approves BUDGET_TOPUP ApprovalRequest → BUDGET_TOPUP_APPROVED event → effectiveLimit increases; prior settlements unchanged.
- Attempt to set immutableLimit higher → rejected; ledger row unchanged; incident.
- Retry with existing reservation: same reservation reused if invocation attempt≤maxAttempts and reservation covers it; no double reservation.

### N5. Persisted-type versioning and MigrationPolicy

Every persisted type carries `schemaVersion` (integer ≥1) and is validated on load: `MissionState`, `EventEnvelope`, `ArtifactManifest`, `ApprovalRequest`, `ApprovalRecord`, `ToolInvocation`, `ToolResultReceipt`, `BudgetLedger`, `RoleManifest`, `CapabilityManifest`, `Checkpoint`, `PublicActionReceipt`, `IncidentRecord`, `HumanAuthorityRecord`. (ArtifactManifest, RoleManifest, CapabilityManifest, Checkpoint, PublicActionReceipt, IncidentRecord, HumanAuthorityRecord are the named v0.1.1 shapes of the v0.1 mission/invocation/artifact/gate/incident records — same normative content, now with explicit schemaVersion fields and version-policy.)

MigrationPolicy:
1. Persisted data is never interpreted without schemaVersion.
2. Unsupported future versions fail closed (read-only diagnostic, no execution).
3. Migrations are forward-only.
4. Migration functions are deterministic and side-effect free (pure bytes→bytes).
5. Migration receives old bytes, produces new bytes.
6. Original bytes are backed up before migration (immutable backup location).
7. Migration records its own durable event + content hash (CHECKPOINT_WRITTEN with migration metadata).
8. Partial migration rolls back fully (transactional).
9. DSH upgrades cannot silently migrate Colony records (DSH pins and Colony schema versions are independent axes; see N9).
10. Colony schema version is independent of DSH package version.
11. Every adapter declares supported Colony and DSH version ranges.
12. Startup refuses incompatible combinations (runtime pin + schema range check).

### N6. Bounded rework and expiry races

`RevisionRequest` (schemaVersion 1): `revisionId`, `sourceArtifactId`, `sourceArtifactHash`, `requestedByRole`, `issueCode` (closed enum), `severity`, `evidence` (artifact references), `requiredChange`, `acceptanceTestIds`, `createdAt`, `expiresAt`.

Limits (Captain-approved):
- Max implementation retries per tool invocation: **2** (3 attempts total, counter per invocation).
- Max implementation/review revision cycles: **2** (revisionCount).
- Max verification retries for infrastructure-only failures: **2**.
- Model/content failures receive **no** automatic blind retry (schema-invalid output is revised through the revision path, not re-asked).
- Exceeding any limit → **HUMAN_REVIEW_REQUIRED** (nonterminal pause; Captain may close/abort) or FAILED if unrecoverable; never silently continues.
- No recursive agent-to-agent retry loops.
- Every retry must cite new evidence or changed input.
- Identical `input + artifact + roleVersion` cannot be auto-retried (dedupe key = tuple hash; replay → HUMAN_REVIEW_REQUIRED).

Approval expiry race rule:
- Artifact finalization occurs before approval request.
- Approval validation + state-transition commit in the same transaction (ColonyStorage).
- Authoritative clock = Kernel persistence-layer clock (injected, non-model).
- `expiresAt <= commitTime` → EXPIRED_AT_COMMIT, rejected, durable APPROVAL_EXPIRED.
- Content or state-version change → STALE (even if not expired), rejected.

### N7. ColonyStorage contract

`ColonyStorage` interface (Colony-owned; no DSH storage internals leak into Kernel):
- `beginTransaction()`, `commit()`, `rollback()`
- `compareAndSwapMissionState(missionId, expectedVersion, nextState, events)` → CAS or CONCURRENCY_CONFLICT
- `appendEvent(envelope)`, `getEventById(eventId)`
- `reserveMissionSequence(missionId)` → next monotone sequence
- `finalizeArtifact(manifest)` (immutable, content-addressed, no replacement)
- `createApprovalRequest(req)`, `recordApprovalDecision(rec)`
- `createToolInvocation(inv)`, `settleToolInvocation(receipt)`
- `reserveBudget(missionId, class, amount, expectedVersion)`, `settleBudget(...)`, `releaseBudget(...)`
- `createCheckpoint(checkpoint)`
- `acquireLease(name, ttl)`, `renewLease(...)`, `releaseLease(...)` — single-writer enforcement
- `atomicApply(missionId, events[], expectedStateVersion)` — event append + state CAS in one transaction

Semantics: serializable behavior for state transitions (or documented optimistic-concurrency equivalent via CAS+unique constraints); unique constraints on eventId, missionId+missionSequence, idempotencyKey-per-scope; atomic event+state commit; immutable finalized artifacts; append-only audit history; no cross-mission mutable paths.

If the locally installed DSH does not expose these semantics natively (it does not: DSH session storage is append-only logs, not a transactional Colony store — see DSH_MAPPING M08), the implementation is **CUSTOM_SQLITE_STORAGE_PLUGIN_REQUIRED**: Colony owns a SQLite-backed ColonyStorage. Milestone 1 allows `InMemoryColonyStorage` (unit tests) and `SQLiteColonyStorage` (deterministic integration tests). The Kernel MUST NOT depend on DSH storage internals directly.

### N8. Workspace and external isolation

Per-mission isolation contract. Filesystem layout:

```
/workspaces/<mission-id>/
  input/
  roles/<role-id>/
  artifacts/
  scratch/
  receipts/
```

1. No shared mutable work file between missions.
2. missionId is host-generated (Kernel), never model-supplied.
3. All resolved paths remain under mission root.
4. Reject absolute paths from model outputs.
5. Reject `..` traversal.
6. Reject symlinks resolving outside mission root.
7. Final artifacts copied into immutable content-addressed storage (mission workspace remains disposable).
8. Workspace is disposable; evidence survives in the artifact store + event log, not in the workspace.
9. DSH cwd is convenience, not confinement.
10. OS-level isolation is mandatory for untrusted execution (external supervisor; same-world DSH sandbox is defense-in-depth, not isolation).
11. Network policy is enforced outside the model and outside prompt instructions.
12. Secrets are never mounted unless the mission capability requires them.
13. Logs and artifacts redact configured secret patterns.
14. Public-write credentials are short-lived and unavailable during ordinary implementation work.

Repository content is untrusted data: README/issues/source/tests/files can contain indirect prompt injection. Repository text cannot grant capabilities, override role contracts, or authorize tools/public actions. Capability decisions are made only by Kernel policy.

### N9. DSH compatibility boundary

All DSH dependencies are isolated behind one adapter package: `colony-dsh-adapter`. No Kernel domain module imports DSH packages directly.

Adapter exposes Colony-owned interfaces: `AgentRuntime`, `PromptAssembler`, `ToolDispatcher`, `SessionRecorder`, `SubagentSpawner`, `HumanApprovalTransport`, `LifecycleController`, `TelemetrySink`.

Requirements:
1. Adapter declares the exact tested DSH package version.
2. Adapter records executable and package hashes.
3. Startup executes a compatibility probe (required symbols/services/events present).
4. Missing expected symbol/service/event → startup fails.
5. Lifecycle registrations are reversible (owned by disposers).
6. Plugin unload removes listeners and releases resources.
7. Colony persisted semantics never depend on DSH internal event names.
8. DSH events are translated into Colony-owned events at the adapter boundary.
9. Unknown DSH events are logged but cannot advance mission state.
10. DSH upgrade requires adapter tests before use.

Current observed runtime: `@deepseek-ai/dsh` **0.1.1-rc.2**; entry `/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js`. No lockfile exists, so two allowed implementation paths (neither executed in this mission):

**PATH A (preferred) — isolated project-local exact installation:** create the Colony package root; `npm install --save-exact @deepseek-ai/dsh@0.1.1-rc.2`; commit `package-lock.json`; record lockfile SHA-256 in the adapter manifest. Runtime compatibility probe runs at startup against this pinned install.

**PATH B — temporary offline snapshot:** archive the installed DSH package and transitive dependency tree; generate an exact package manifest/SBOM; record SHA-256 per file; treat as non-portable and temporary (do not use as a long-term pin). PATH B is a stopgap only if PATH A's install fails offline; it must be replaced by PATH A before Milestone 2.

Details and decision record: `dsh-runtime-pin-plan.md`.

### N10. State machine

Canonical 22-state enum:

```
CREATED, POLICY_SCREENING, POLICY_REJECTED, RECONNAISSANCE, PLANNING, CHALLENGE,
AWAITING_PLAN_APPROVAL, IMPLEMENTATION, VERIFICATION, TECHNICAL_REVIEW, REVISION,
DOCUMENTATION, FINAL_POLICY_GATE, AWAITING_PUBLISH_APPROVAL, READY_TO_PUBLISH,
PUBLIC_ACTION_PENDING, RECONCILIATION_REQUIRED, PUBLISHED, CLOSED, ABORTED, FAILED,
HUMAN_REVIEW_REQUIRED
```

Terminal: POLICY_REJECTED, CLOSED, ABORTED, FAILED, PUBLISHED. Nonterminal pause states: HUMAN_REVIEW_REQUIRED, RECONCILIATION_REQUIRED. Public-action states PUBLIC_ACTION_PENDING and RECONCILIATION_REQUIRED(public side) are **reserved for a future publication adapter**; v0.1.1 disables public writes (Captain decision) so those states are **explicitly exempt from the reachability rule** and MUST NOT be entered in v0.1.1 (PUBLICATION_DISABLED rejection). Their contracts are specified now so a future adapter does not redesign the state machine.

Per-state contracts (entry requirements, allowed next states, exit guarantees, whether LLM may run, whether tools may run, whether human approval required, recovery behavior) — full table in `review-packet-v0.1.1/STATE_MACHINE_AUDIT.md`; the normative summary:

| State | Entry requirement | Exit guarantee | LLM | Tools | Human approval | Recovery |
|---|---|---|---|---|---|---|
| CREATED | CreateMission command valid | →POLICY_SCREENING or →ABORTED; no other exit | N | N | N | resume re-evaluates guards |
| POLICY_SCREENING | StartMission authorized; budget reserved | exactly one of →RECONNAISSANCE, →POLICY_REJECTED, →HUMAN_REVIEW_REQUIRED | Y (Gatekeeper) | read-only | N | blocked re-evaluates verdict; bounded rescreen (2) |
| POLICY_REJECTED | forbidden verdict event | none (terminal) | N | N | n/a | query/export only |
| RECONNAISSANCE | policy allowed; branches committed | →PLANNING when required branch set complete | Y | read-only | N | blocked siblings preserved; required failure blocks after bounded retry |
| PLANNING | recon complete; plan inputs frozen | →CHALLENGE | Y | read-only | N | bounded plan rework (2) |
| CHALLENGE | plan digest frozen | →AWAITING_PLAN_APPROVAL or →PLANNING (bounded) | Y | read-only | N | bounded rework |
| AWAITING_PLAN_APPROVAL | gate request created with TTL | exactly one of →IMPLEMENTATION, →PLANNING, →CLOSED, or expiry →HUMAN_REVIEW_REQUIRED | N | N | Y | expiry pauses; Captain reissues gate (bounded 2) |
| IMPLEMENTATION | approved plan scope envelope + permit | →VERIFICATION or →REVISION or →HUMAN_REVIEW_REQUIRED | Y | scoped writes in private workspace | N | uncertain attempt blocks pending quiescence/reconciliation |
| VERIFICATION | candidate finalized; runner receipt channel | →TECHNICAL_REVIEW or →REVISION or →HUMAN_REVIEW_REQUIRED | Y (Verifier) | isolated runner | N | infra failure retry ≤2; content failure → revision |
| TECHNICAL_REVIEW | verification digest bound | →DOCUMENTATION or →REVISION or →HUMAN_REVIEW_REQUIRED | Y | read-only | N | bounded revision cycles (2) |
| REVISION | revisionRequest recorded | →IMPLEMENTATION (count<2) or →HUMAN_REVIEW_REQUIRED | N | N | N | count never resets; no automatic reset |
| DOCUMENTATION | review approval bound | →FINAL_POLICY_GATE or →REVISION (bytes changed) | Y | docs-only writes | N | byte change re-enters verification |
| FINAL_POLICY_GATE | package frozen pre-assessment | →AWAITING_PUBLISH_APPROVAL, →POLICY_REJECTED, or →HUMAN_REVIEW_REQUIRED | Y (Gatekeeper) | read-only | N | non-enforceable restriction → HUMAN_REVIEW_REQUIRED |
| AWAITING_PUBLISH_APPROVAL | final-policy pass; gate with TTL | →READY_TO_PUBLISH, →CLOSED, →REVISION, or expiry →HUMAN_REVIEW_REQUIRED | N | N | Y | expiry pauses; reissue bounded (2) |
| READY_TO_PUBLISH | consumed package grant | →CLOSED (local close) only; public writes disabled | N | N | Y (consumed approval) | local export only |
| PUBLIC_ACTION_PENDING | (reserved) public adapter authorized + approval consumed | (reserved; future adapter defines exits) | N | N | Y | reserved; not entered in v0.1.1 |
| RECONCILIATION_REQUIRED | external outcome unknown after dispatch | →(prior stage) after human reconciliation; or →FAILED | N | N | Y | human decides redispatch vs close; never auto-retry |
| PUBLISHED | (reserved) external confirmation | none (terminal) | N | N | Y | reserved; not entered in v0.1.1 |
| CLOSED | normal end / local close | none (terminal) | N | N | n/a | query/export audit only |
| ABORTED | Captain abort event | none (terminal) | N | N | n/a | query/export audit only |
| FAILED | unrecoverable failure event | none (terminal) | N | N | n/a | query/export audit only |
| HUMAN_REVIEW_REQUIRED | limit exhaustion / blocking incident | →prior stage (human decision) or →CLOSED/→ABORTED/→FAILED | N | N | Y | nonterminal pause; close/abort always available |

Transition legality: default deny (any edge not in this table or the full audit table is illegal); terminal states have no exits; entering a reserved public state → PUBLICATION_DISABLED; every legal transition emits ≥1 event from the closed vocabulary; every cycle consumes a bounded counter (revision 2, plan rework 2, text-only package rework 2, gate reissue 2, verification infra retry 2, human resumption 2 per mission); public action cannot precede approval bound to exact artifact hashes; recovery never directly invokes public side effects.

### N11. Four-axis evidence model (correction of review model)

For every acceptance criterion, four independent statuses are maintained:

- **spec_status:** COMPLETE | PARTIAL | MISSING | CONFLICTING
- **test_status:** DETERMINISTIC_TEST_DEFINED | INTEGRATION_TEST_DEFINED | LLM_DEPENDENT_TEST | UNTESTABLE | MISSING
- **dsh_mapping_status:** LOCALLY_MAPPED | CUSTOM_PLUGIN_REQUIRED | UNSTABLE_ASSUMPTION | MISSING
- **implementation_status:** NOT_STARTED | IMPLEMENTED | VERIFIED | FAILED

Because implementation has not started, NOT_STARTED is expected and MUST NOT count as a specification failure. The v0.1 review packet conflated these axes; v0.1.1 separates them. Full 35-row matrix: `review-packet-v0.1.1/AC_TRACEABILITY.md`.

### N12. Milestone 1 acceptance criteria (A01–A35, repaired)

All 35 original IDs are preserved. Each is one testable normative sentence, with spec_status=COMPLETE, at least one defined test, a DSH mapping or explicit CUSTOM_PLUGIN_REQUIRED, and implementation_status=NOT_STARTED. Full per-AC matrix (invariant/state/contract/test/mapping columns) is in `review-packet-v0.1.1/AC_TRACEABILITY.md`. The 35 repaired ACs:

| ID | Normative sentence (one sentence, testable) | Key repair vs v0.1 |
|---|---|---|
| A01 | A fully approved local mission reaches READY_TO_PUBLISH and then CLOSED through exactly the legal transitions, with no public action and no remote dispatch. | unchanged intent; explicit event set now normative |
| A02 | A forbidden initial-policy verdict closes the mission (POLICY_REJECTED) before any specialist dispatch. | POLICY_REJECTED is now a distinct terminal state |
| A03 | An unknown or non-enforceable restricted verdict pauses the mission at HUMAN_REVIEW_REQUIRED with a concrete incident, never dispatches under ambiguity. | distinct pause state; not silent block |
| A04 | Any command or transition not explicitly allowed is rejected without workflow-state mutation and produces a durable rejection record. | durable rejection audit now normative |
| A05 | Implementation dispatch requires an unconsumed APPROVED ApprovalRecord whose approvalSubjectHash matches the current mission state version and plan-subject content hash. | content-addressed approval (N1) replaces prose gate |
| A06 | READY_TO_PUBLISH requires tests, independent review, final policy, and a consumed PACKAGE_APPROVAL, each bound to the exact artifact hashes. | explicit binding set |
| A07 | A consumed, revoked, expired-at-commit, wrong-mission, or different-subject ApprovalRecord cannot authorize any transition. | transactional expiry (N1 req 8) |
| A08 | Repeating an identical command returns the original receipt; reusing its ID with changed payload/principal returns IDEMPOTENCY_CONFLICT without effects. | unchanged; now backed by N2 idempotencyKey rules |
| A09 | Competing commands with the same expectedRevision produce exactly one commit and one CONCURRENCY_CONFLICT. | unchanged |
| A10 | An invalid-schema or over-limit payload creates no accepted artifact and no workflow mutation. | unchanged |
| A11 | Model payload cannot overwrite trusted provenance fields (roleId, roleVersion, invocationId, missionId, timestamps, hashes). | unchanged |
| A12 | Equal canonical payloads produce equal hashes; any byte or protected-metadata tampering is detected before acceptance. | unchanged |
| A13 | A result from a wrong mission, wrong epoch, cancelled or superseded invocation is rejected and never advances state. | unchanged |
| A14 | A parallel join completes only when every required current-epoch branch has a committed result, regardless of completion order. | unchanged |
| A15 | A failed required branch preserves successful siblings and blocks join progression after its bounded retry allowance (2 infra retries). | bound made explicit |
| A16 | A role cannot assess or approve its own output, and the Reviewer cannot implement requested changes. | self-approval ban extended to budget top-ups and approvals (N1 req 10, N4 req 11) |
| A17 | The Verifier cannot mutate production bytes, and a measured runner failure cannot be overridden by any prose report. | unchanged |
| A18 | Any change to candidate content invalidates all downstream verdicts and publish approval, transactionally at the next guard evaluation. | invalidation now event-backed (ARTIFACT_REJECTED + invalidation events) |
| A19 | A documentation byte change re-enters verification and review rather than skipping them. | unchanged |
| A20 | The third implementation/review revision cycle is blocked with a durable REVISION_LIMIT event and the counter never resets. | unchanged; text-only rework bounded (N6) |
| A21 | Budget reservation is atomic and concurrent attempts cannot overspend (`spent+reserved ≤ effectiveLimit` at every commit). | ledger semantics (N4) |
| A22 | Timeout or abort revokes permits and rejects late results; retry waits for proven quiescence. | unchanged |
| A23 | A crash at any of the four defined points around blob publication preserves the defined acceptance semantics (see N3 crash matrices). | crash matrix normative |
| A24 | Restart replay reproduces the mission view and gate bindings; unsupported event/schema versions fail closed. | apply-once rules (N2) |
| A25 | A crash after runtime acceptance but before receipt delivery does not blindly redispatch; the invocation pauses pending reconciliation. | unchanged; crash matrix (N3) |
| A26 | A second writer fails startup, and a missing or corrupt finalized blob blocks the affected mission. | unchanged |
| A27 | Duplicate role ownership or pin mismatch is rejected; a live mission role cannot hot-swap. | unchanged |
| A28 | Prompt section order, budget enforcement, source exclusion and expired-knowledge behavior are reproducible for a fixed mission/role/stage. | unchanged |
| A29 | Plugin mount/unmount leaves no listeners, tools, handles, timers or open writer resources (verified by resource-count assertions). | unchanged |
| A30 | DSH scoped setup restricts known and future/nested tools; the native adapter reports real structured outcomes, not prose claims. | unchanged; adapter boundary (N9) |
| A31 | External isolation rejects host/sibling path and network access; process timeout terminates owned descendants. | unchanged; deployment gate |
| A32 | Ten clean independently isolated dry runs produce reproducible hashes and zero unauthorized dispatched calls. | unchanged |
| A33 | Public writes and PUBLISHED remain disabled in v0.1.1 even with a valid package approval (PUBLICATION_DISABLED). | unchanged (Captain decision) |
| A34 | A stale UI action conflicts instead of approving newer content, and an approval-disabled configuration never grants consent. | unchanged |
| A35 | Backup restores the original mission base and historical lab assets are unchanged (byte-hash evidence). | unchanged |

### N13. Testing decisions

Primary seam is unchanged from v0.1: Kernel command submission plus mission/event/artifact queries. Fake runtime, fake clock, isolated storage and injected Captain principal make tests deterministic. v0.1.1 adds: apply-once event tests, ledger CAS tests, crash-matrix coverage (N3), migration-policy tests, workspace-escape tests, and bounded-rework exhaustion tests. Full plan: `review-packet-v0.1.1/TEST_PLAN_AUDIT.md` (T-U/T-B/T-C/T-D/T-E/T-F/T-G/T-H/T-I series, cross-referenced by AC in `AC_TRACEABILITY.md`).

## User Stories

(v0.1 §User Stories applies unchanged; story 24 — publication disabled — is restated: as a release operator, I want GitHub write and PUBLISHED to remain disabled in v0.1.1 even with a valid package approval, so public actions cannot occur while the publication adapter is unproven.)

## Out of Scope

- Implementing the Kernel, running tests, executing migrations, or mounting any plugin in this mission (specification-only revision).
- Enabling public writes, publication adapter, or public-action states in v0.1.1 (Captain decision).
- LangGraph, new agent loop, flat chat, automatic role creation; live models in Milestone 1.
- Modifying v0.1 documents, DSH installation, profiles, SOULs, agents, plugins, or experiments.
- Distributed scheduling, multi-host leases, network filesystems.
- Executing the DSH pin paths (PATH A/B) in this mission — specification only.

## Further Notes

- v0.1 documents remain byte-identical and normative-historical; v0.1.1 supersedes them for new work.
- All 24 invariants restated to COMPLETE (see INVARIANTS_AUDIT.md in the packet); no invariant is PARTIAL/ABSENT/CONTRADICTORY.
- All 35 ACs: spec_status=COMPLETE, ≥1 test defined, DSH mapping or CUSTOM_PLUGIN_REQUIRED, implementation_status=NOT_STARTED.
- Captain-approved policy decisions recorded in this document: public writes disabled; rework limits as specified in N6; top-ups restricted per N4; reserved states exempt from reachability.
- The mission/user story language and module ownership (§2, §13–15 of v0.1) carry forward unchanged except where explicitly repaired above.
