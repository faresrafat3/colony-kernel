# Colony Kernel

A deterministic mission-control kernel for AI-agent colonies. Models propose; only the kernel commits. State is kernel-owned: a 22-stage default-deny machine, apply-once events with CAS versions and canonical payload hashes, content-addressed approvals, a CAS budget ledger, deny-by-default roles.

## Language

### Mission & lifecycle

**Mission**:
A unit of work tracked end-to-end by the kernel, from creation through a 22-stage lifecycle to a terminal state. Has a title, a current stage, a state version, a sequence number, bounded rework counters, and bound subject hashes.
_Avoid_: Task, job, run, workflow instance

**Stage** (MissionStage):
One of 22 canonical states in a Mission's lifecycle (CREATED, PLANNING, IMPLEMENTATION, VERIFICATION, …). The single source of truth is the EDGES table in `state-machine.ts`.
_Avoid_: Phase, state, step

**Terminal Stage**:
A final Stage from which no transition exits: POLICY_REJECTED, CLOSED, ABORTED, FAILED, PUBLISHED.
_Avoid_: End state, done state

**Pause Stage**:
A Stage where no automatic work executes: HUMAN_REVIEW_REQUIRED, RECONCILIATION_REQUIRED. Only abort, fail, and recovery exits are legal.
_Avoid_: Blocked state, waiting state

**Resume Stage** (pause return target):
The Stage recorded immediately before entering a Pause Stage, used by RECOVERY_COMPLETED to re-enter the pre-pause Stage. Distinct from Revision Return Stage: pause/recovery bookkeeping must never overwrite a revision's return target, even when a pause occurs mid-rework.
_Avoid_: Previous stage, return stage, revision return stage

**Revision Return Stage** (rework return target):
The Stage recorded when a Mission enters REVISION, determining where REVISION_COMPLETED routes it back to after the rework (IMPLEMENTATION, VERIFICATION, TECHNICAL_REVIEW, or DOCUMENTATION). Distinct from Resume Stage: the two targets are stored in separate state fields so neither can clobber the other.
_Avoid_: Resume stage, rework target, return stage

**Reconnaissance**:
The Stage where an agent gathers information about the target repository or task before planning. Produces a recon_brief Artifact.
_Avoid_: Research, discovery, exploration

**Reconciliation**:
The Stage entered when a tool invocation outcome is unknown (TOOL_INVOCATION_OUTCOME_UNKNOWN). Requires human recovery to resolve.
_Avoid_: Recovery, sync, repair

**Checkpoint**:
A persisted snapshot of Mission state (CHECKPOINT_WRITTEN event). Informational; does not change the Stage.
_Avoid_: Save, snapshot, bookmark

**State Version**:
A monotone counter on a Mission, incremented exactly once per accepted Event. Used as the expectedStateVersion in CAS commits.
_Avoid_: Revision, version number, sequence

**Mission Sequence**:
A per-Mission monotone counter for Events, starting at 1. Distinct from State Version: one Event advances both, but they serve different concurrency purposes.
_Avoid_: Event index, sequence number

**Counter** (CounterName):
A bounded, never-reset rework counter on a Mission (revisionCount, planReworkCount, gateReissueCount, verificationInfraRetryCount, textOnlyPackageReworkCount, humanResumptionCount). Each has a hard limit (default 2).
_Avoid_: Retry count, attempt count

**Rework**:
A bounded return to an earlier Stage triggered by a Revision or a rejected approval, consuming a Counter.
_Avoid_: Retry, re-attempt

### Events

**Event** (EventEnvelope):
An immutable, content-addressed record of a state transition. Carries a type from the closed 40-type vocabulary, an actor, causation/correlation IDs, an idempotency key, payload, and payload hash.
_Avoid_: Message, command, request

**Event Type**:
One of 40 closed event types in the EventType vocabulary (MISSION_CREATED, PLAN_PROPOSED, APPROVAL_RECORDED, …). Unknown types fail closed.
_Avoid_: Event kind, event name

**Actor** (EventActor):
The identity that performed an Event: actorType, actorId, roleId, roleVersion. Never model-supplied; derived from the role registry.
_Avoid_: User, agent, sender

**Idempotency Key**:
A scope-qualified key ensuring an Event is applied at most once within its scope.
_Avoid_: Dedup key, request id

**Tool Invocation**:
A tracked call to an external tool, with five lifecycle events (PREPARED, DISPATCHED, SETTLED, FAILED, OUTCOME_UNKNOWN). Each invocation allows at most 3 attempts.
_Avoid_: Tool call, command, execution

**Max Attempts**:
The per-tool-invocation attempt ceiling (3). Enforced by the kernel, not by the tool.
_Avoid_: Retry limit, attempt limit

**Correlation ID**:
A tracing identifier linking related Events across a Mission.
_Avoid_: Trace id, request id

**Causation ID**:
A reference to the Event that caused this one.
_Avoid_: Parent id, cause

**Payload Hash**:
SHA-256 over the JCS-canonical payload bytes, stored in the Event for integrity verification.
_Avoid_: Content hash, checksum

**CAS** (Compare-And-Swap):
Optimistic concurrency control via version numbers (State Version, Ledger Version). A commit fails if the expected version does not match current.
_Avoid_: Optimistic lock, version check

**Durable Rejection**:
A recorded rejection of an illegal transition or failed commit, stored in the rejection log before any state mutation. Never deleted.
_Avoid_: Error, failure record

**Apply-Once**:
The guarantee that each accepted Event is reduced exactly once into MissionState, via the pure applyEvent reducer.
_Avoid_: Idempotent apply, single apply

### Artifacts

**Artifact** (ArtifactManifest):
A content-addressed deliverable produced during a Mission. Carries an artifactId, type, content hash, producer role identity, and finalization timestamp.
_Avoid_: Document, file, output

**Artifact Type**:
One of eight deliverable kinds: recon_brief, plan, plan_challenge, implementation_candidate, verification_report, technical_review, documentation_bundle, final_package.
_Avoid_: Artifact kind, document type

**Artifact Subject Ref**:
A reference to an Artifact (id, type, schema version, content hash, finalization time) used as a binding target in an ApprovalRequest.
_Avoid_: Artifact reference, subject

**Content-Addressed**:
Identified by the SHA-256 hash of its canonical (JCS) content bytes. No two distinct contents share an address.
_Avoid_: Hash-addressed, content-id

**Canonicalization** (JCS):
RFC 8785 JSON Canonicalization Scheme, used to produce deterministic bytes for hashing. The single canonical form for all content and payload hashes.
_Avoid_: Normalization, serialization

### Approvals

**Approval** (ApprovalRequest / ApprovalRecord):
A content-addressed, transition-bound human authorization. An ApprovalRequest is issued; an ApprovalRecord captures the decision. Purposes: PLAN_APPROVAL, PACKAGE_APPROVAL, BUDGET_TOPUP.
_Avoid_: Sign-off, consent, authorization

**Approval Purpose**:
The reason an Approval is requested: PLAN_APPROVAL (plan gate), PACKAGE_APPROVAL (publish gate), or BUDGET_TOPUP (budget increase).
_Avoid_: Approval type, approval kind

**Approval Subject Hash**:
SHA-256 over the JCS-canonical bytes of an ApprovalRequest. Used for at-most-once consumption tracking.
_Avoid_: Request hash, subject id

**Human Authority**:
An identity that is NOT an agent role. Required to record any Approval decision. Agents are structurally banned from approving.
_Avoid_: Human approver, captain, user

**Action Class**:
The risk classification of an action requiring approval: LOCAL_READ, LOCAL_WRITE, PUBLIC_WRITE, BUDGET.
_Avoid_: Action type, permission level

**Approval Decision**:
APPROVED or REJECTED. A rejection may include a requestedChange flag to trigger rework.
_Avoid_: Verdict, outcome

**Authority Proof**:
A transport-authenticated proof descriptor (method + reference) attached to an ApprovalRecord. Carries no secret material.
_Avoid_: Token, credential, signature

**Expiry**:
Deterministic time-based invalidation of an ApprovalRequest, checked against the injected clock at commit time.
_Avoid_: Timeout, TTL

### Budgets

**Budget** (BudgetLedger):
Per-Mission, per-resource-class accounting. Tracks an immutable limit, approved top-ups, reserved amount, spent amount, released reservations, and a CAS version.
_Avoid_: Quota, allowance, credit

**Resource Class**:
A budgeted resource dimension: model_tokens, wall_clock_ms, tool_calls, monetary_cost, revision_cycles.
_Avoid_: Resource type, budget category

**Effective Limit**:
The immutable limit plus all approved top-ups. The ceiling against which reserved + spent is checked.
_Avoid_: Total budget, cap

**Immutable Limit**:
The original budget ceiling set at Mission creation. Cannot be mutated; only top-ups can raise the Effective Limit.
_Avoid_: Base budget, initial limit

**Reserved**:
Budget held by in-flight work but not yet spent. Released on cancellation.
_Avoid_: Held, allocated

**Spent**:
Budget consumed by completed work. Never decreases.
_Avoid_: Used, consumed

**Released**:
Budget returned from cancelled reservations. Tracked separately from Spent.
_Avoid_: Refunded, freed

**Top-Up**:
An approved increase to a Budget's Effective Limit, bound to a BUDGET_TOPUP Approval. Only allowed for non-revision Resource Classes.
_Avoid_: Budget increase, credit

**Ledger Version**:
The CAS version of a BudgetLedger row, incremented on every mutation.
_Avoid_: Budget version, row version

### Revisions & rework

**Revision** (RevisionRequest):
A bounded rework request carrying an issue code, severity, evidence, required change, and acceptance test IDs. Triggers a transition to the REVISION Stage.
_Avoid_: Fix request, change request, rework request

**Issue Code**:
A closed code classifying why a Revision was requested: VERIFICATION_CONTENT_FAILURE, VERIFICATION_INFRASTRUCTURE_FAILURE, REVIEW_CHANGES_REQUESTED, DOCUMENTATION_BYTE_CHANGE, PACKAGE_REQUEST_CHANGE.
_Avoid_: Error code, failure type

**Revision Dedupe Key**:
SHA-256 over (issueCode, sourceArtifactHash, requestedByRoleId). Prevents identical rework from being auto-retried.
_Avoid_: Dedup key, retry key

**Severity**:
content or infrastructure. Distinguishes a code defect from a tooling/environment failure.
_Avoid_: Priority, level

### Roles & capabilities

**Role** (RoleManifest):
An agent identity with a roleId, roleVersion, granted capabilities, and a separation-of-duties flag. Deny-by-default: unknown roles have no capabilities.
_Avoid_: Agent, user, actor

**Capability** (CapabilityManifest):
A permission to produce certain Artifact Types in a scope (plan, implementation, verification, review, documentation, policy). Granted explicitly; absent means denied.
_Avoid_: Permission, right, privilege

**Role Registry**:
The kernel-owned store of RoleManifests. Must not be empty (structural invariant). Cannot be mutated by the role it describes.
_Avoid_: Role store, permission registry

**Capability ID**:
One of eight capabilities: propose_plan, produce_implementation_artifact, produce_verification_artifact, produce_review_artifact, produce_documentation, screen_policy, conduct_reconnaissance, challenge_plan.
_Avoid_: Capability name, permission id

**Deny-by-Default**:
Unknown roles and unlisted capabilities are denied. No implicit grants exist.
_Avoid_: Default deny, fail closed

**Separation of Duties**:
A Role may never approve its own output. Enforced by mayNotApproveOwnOutput on every RoleManifest.
_Avoid_: Self-approval ban, conflict of interest

### Actors & authority

**Human Authority**:
An identity that is not an agent Role ID. Structurally required for all Approval decisions. The check is `!agentRoleIds.includes(decidedBy)`.
_Avoid_: Human user, captain, approver

**Agent Role ID**:
The list of role IDs that may never act as a Human Authority. Derived from the Role Registry's own manifests, so it cannot drift.
_Avoid_: Agent list, denied approvers

**Agent Runtime**:
A port (AgentRuntime) providing the model-facing execution environment. M1A uses a fake runtime; real runtime integration is deferred to M2.
_Avoid_: LLM runtime, model provider

**Agent Invocation**:
A recorded call to the Agent Runtime (AgentInvocation / AgentInvocationRecord), tracked for provenance and budget settlement.
_Avoid_: Agent call, model call

### Storage & concurrency

**Storage Transaction**:
A staged, atomic unit of mutation. Changes are invisible to readers until commit; rollback discards all staged changes.
_Avoid_: DB transaction, atomic block

**Lease**:
A named, TTL-bound lock for single-writer enforcement. Acquired before work; released after.
_Avoid_: Lock, mutex

**Telemetry**:
Derived, non-authoritative observability records (transition, rejection, approval, budget, invocation, recovery). Never authorizes anything.
_Avoid_: Logs, metrics, audit trail

**Kernel Error**:
A structured error with a code and details, thrown by domain logic. Every rejection is a KernelError.
_Avoid_: Exception, domain error

**Result Type**:
An Ok/Err wrapper for fallible operations. Used by ports and adapters; domain logic throws KernelError directly.
_Avoid_: Either, Outcome, Response
