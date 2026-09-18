---
kind: spec
status: ready-for-agent
created: 2026-09-17
id: CK-001
version: 0.1.0
---

# Colony Kernel v0.1 — deterministic mission control on DeepSeek Harness

## Problem Statement

Anatomy Lab has rich role descriptions and historical experiments, but role prose cannot enforce mission ordering, permissions, independent review, budgets, publication consent, or recoverable artifact handoffs. A shared mutable workspace can contaminate results. A model saying that work passed is not an independently observed verification result.

The Captain needs a colony, not a chatroom: specialists with bounded responsibilities, a durable evidence trail, and two normal human decisions (approve work and approve the publication package). Exceptional failures may require additional intervention.

## Solution

Use DeepSeek Harness (DSH) as the replaceable agent runtime. Build Colony Kernel as a deterministic TypeScript module, exposed through a native Cordis host plugin. No LangGraph in v0.1. Models propose plans and artifacts; only Kernel transactions change mission state or grant invocation permits. DSH owns agent loops and sessions; Kernel owns mission truth and durable dispatch accounting.

**Delivery scope:** this document specifies the complete v0.1 contract and the first skeleton. It does not assert that a running colony, runtime migration, or deployment already exists. The first implementation is Milestone 1: Kernel, contracts, durable store, role registry, human gates, and a fake runtime. It must not start real models. Later milestones integrate the first six roles, isolated execution, and the Captain UI.

**Normative language:** MUST is required, SHOULD requires a documented exception, MAY is optional. Any transition or capability not explicitly allowed is denied. Proposed interfaces below belong to Colony, not to DSH.

## User Stories

1. As Captain, I want one mission objective and scope so specialists cannot silently expand the task.
2. As Captain, I want a policy screen before any reconnaissance or implementation.
3. As Captain, I want a plan, risks, effort estimate, and expected value before granting work.
4. As Captain, I want publication consent bound to the exact reviewed package, not to arbitrary future actions.
5. As Captain, I want reject, request-change, and abort controls without having to chat with every specialist.
6. As Captain, I want unknown policy, missing evidence, and unavailable approvals to stop progress safely.
7. As First Mate, I want structured specialist results rather than unbounded shared chat.
8. As First Mate, I want Kernel to choose eligible routes and enforce budgets even when my proposal is wrong.
9. As Cartographer, I want immutable repository input and no production write capability.
10. As Craftsman, I want a private candidate workspace and a reproducible base revision.
11. As Verifier, I want to run tests against the exact candidate without editing its production files.
12. As Reviewer, I want to request changes without implementing or approving my own implementation.
13. As Gatekeeper, I want an initial scope assessment and a separate final-package assessment.
14. As a specialist, I want schema errors reported precisely with a bounded retry allowance.
15. As an operator, I want duplicate deliveries to produce one accepted outcome.
16. As an operator, I want crash recovery to preserve approvals and evidence without silently repeating side effects.
17. As an operator, I want each artifact attributed to a mission, invocation, model, role version, and content hash.
18. As an operator, I want partial parallel results preserved without treating the join as complete.
19. As Captain, I want a hard revision-loop limit and a concrete blocker instead of endless work.
20. As a role author, I want long source Anatomies preserved while runtime prompts stay small and versioned.
21. As a maintainer, I want DSH changes confined to one adapter and caught by contract tests.
22. As Steward, I want only curated, attributed, approved lessons retrieved for a new mission.
23. As an observer, I want measured latency, token usage, failures, and interventions, not imagined agent emotions.
24. As a release operator, I want GitHub write disabled even if a model requests it or a publication package is approved.
25. As Captain, I want historical experiments and existing profiles left untouched by this migration.

## Implementation Decisions

### 1. Scope, vocabulary, and trust

- **Mission:** one immutable objective, repository base, allowed scope, risk policy, pinned role set, and budget envelope.
- **Stage:** one deterministic workflow phase; stage names are not permissions.
- **Invocation:** one role attempt at one stage epoch against explicit input hashes.
- **Candidate:** immutable repository snapshot/tree digest plus patch and base revision, never merely a mutable branch name.
- **Artifact:** immutable validated evidence with trusted provenance and content-addressed bytes.
- **Approval:** an authenticated Captain decision bound to a particular subject digest and gate generation.
- **Permit:** private host authorization for one invocation; cannot be minted or widened by an agent.
- **Incident:** durable record explaining a rejected result, policy violation, failure, or operator intervention.
- **Role Package:** source material plus a versioned runtime contract, knowledge, schemas, and evals. It is not a DSH profile.
- **Capability Class:** shared maximum capability envelope; role and invocation restrictions can only narrow it.
- **Runtime Adapter:** Colony's interface to DSH. A fake adapter implements the same observable contract for tests.

Trusted computing base: reviewed Kernel, storage adapter, runtime adapter, tool bodies, authenticated Captain transport, and external isolation supervisor. Models, repositories, web pages, role outputs, tool arguments, and imported lessons are untrusted data. Same-process third-party plugins are not isolated from secrets or Kernel internals: do not mount untrusted plugins in the colony host.

### 2. Module ownership

The distribution name is `@anatomy-colony/dsh-colony`. Logical modules are:

| Module | Sole responsibility | First skeleton |
|---|---|---|
| colony-kernel | Mission transactions, state machine, orchestration policy | Required |
| colony-contracts | Closed schemas, validation, canonical encoding | Required |
| colony-artifacts | Immutable blob publication, artifact references, integrity | Required |
| colony-role-registry | Validated immutable role catalog and version/hash pins | Required |
| colony-gates | Identity-bound plan/package consent and permit decisions | Required |
| colony-router | Eligible role selection and parallel-join declarations | Minimal fixed six-role route |
| colony-prompt-compiler | Bounded section assembly and context selection | Interface and fixture; live binding later |
| colony-evals | Acceptance/regression evidence | Deterministic tests required |
| colony-telemetry | Measured counters, durations and incidents | Minimal event projection |
| colony-memory | Explicit curated retrieval | Deferred; empty retrieval |
| colony-github | External repository integration | Deny-write implementation only |

These are ownership divisions, not a requirement to manufacture eleven empty independently released npm packages. The skeleton may colocate small implementations behind package entry points. DSH imports MUST be confined to its adapter. No model SDK, DSH handle, Cordis context, or live service object may enter persisted Colony state.

### 3. Compatibility and composition

The locally observed installed CLI version is **0.1.1-rc.2**. Its directory has no Git metadata, so no exact upstream commit has been established. A version observation is not a reproducible dependency lock. The release gate MUST require either an exact source commit plus reproducible build, or an explicitly accepted exact package lock with integrity values and image digest. Do not set a guessed `DSH_PINNED_COMMIT`, or equate another checkout's HEAD with the installed build.

Kernel version is `0.1.0`; mission, role, artifact, command, and event schema versions begin at `1`. Each mission records the runtime build identity and policy/compiler versions. Refuse new mission execution on an unapproved pin mismatch. Unknown persisted schema versions are read-only diagnostics, never auto-migrated during resume.

Shared services and persistence belong in the host composition. Session-scoped role identity, prompt sections and tool contributions belong in agent presets. Author new capability-class presets; never edit shipped presets. Role-specific restrictions are installed during unpublished agent setup. A host service must not be accidentally published into a session-only scope. All registrations and resources are owned by a Cordis lifecycle disposer. Unload closes admission, revokes permits, drains or terminates owned work, flushes state, then disposes registrations.

The first skeleton plugin only exposes a trusted host interface. It does not add a model-callable approval tool, alter the currently running GUI, or install itself into this session. A lifecycle test mounts it in a disposable Cordis context. Live UI and agent mounting are later integration acceptance items.

### 4. Data contract

All inbound JSON uses strict validation with unknown keys rejected. JSON Schema draft 2020-12 is the canonical interchange contract; choose a pinned standards-compliant validator at implementation. TypeScript types are derived or checked against it, not maintained as a divergent validation scheme. Reject remote schema references, coercion, implicit defaults, nonfinite numbers, unsupported prototypes, cycles, duplicate JSON keys, and over-limit payloads. Apply defaults only in trusted constructors before validation.

Identifiers are host-generated UUIDs. Versions are exact semver values. Digests are lowercase SHA-256 hex strings. Timestamps are UTC RFC3339 strings; durations and counters are nonnegative safe integers. Money uses integer micro-USD, not floating-point dollars. Default limits: command JSON 256 KiB, artifact JSON 1 MiB, binary/text artifact 10 MiB, recursion depth 32, 100 artifacts per mission, and 100 active/historical invocations per mission. Over-limit input is rejected before expensive parsing or disk publication; deployment may lower limits.

#### Mission record

| Field | Contract |
|---|---|
| schemaVersion, kernelVersion | Exact supported versions |
| missionId, objective, createdAt | Host identity; objective 1–16,000 characters |
| repository | Optional for non-code work; required for code dry runs: allowed local identity, base commit, tree digest |
| stage, stageEpoch, revision | Workflow stage; monotone stage-entry generation; monotone transaction revision |
| disposition | active, blocked, closed, aborted; published reserved for later versions |
| riskTier | 0, 1, 2, or 3; v0.1 executes only local tier 0–1 missions; higher tiers block |
| scopeDigest, policyVersion | Frozen permitted work and policy identity |
| roleVersions, roleHashes, runtimePin | Immutable mission pin set |
| rolesInvoked | Invocation references; no live handles |
| artifacts | Accepted immutable artifact references |
| policyStatus | unknown, allowed, restricted, forbidden; supplemented by separate initial/final evidence |
| planStatus | pending, approved, rejected |
| verificationStatus | pending, passed, failed, always bound to candidate digest |
| reviewStatus | pending, approved, changes_requested, bound to candidate and verification digests |
| revisionCount | Initial implementation is 0; at most 2 corrective cycles by default |
| budgets | Hard limits, reservations, settled consumption, unknown usage flags |
| humanApprovals | Append-only decision references; status is derived from current subject bindings |
| incidents | Append-only incident references |
| requiredBranches | Frozen role/branch set for current parallel stage |
| candidateDigest, planDigest, packageDigest | Optional until produced; never inferred from last chat text |
| blockedReason, resumeStage | Set only by Kernel when blocked |

`stage` includes CREATED, POLICY_SCREENING, RECONNAISSANCE, PLANNING, CHALLENGE, AWAITING_PLAN_APPROVAL, IMPLEMENTATION, VERIFICATION, TECHNICAL_REVIEW, REVISION_LOOP, DOCUMENTATION, FINAL_POLICY_GATE, AWAITING_PUBLISH_APPROVAL, READY_TO_PUBLISH, PUBLISHED, CLOSED, ABORTED. Blocking is an orthogonal disposition, retaining the exact stage and evidence for inspection. `PUBLISHED` is unreachable in v0.1.

#### Invocation record

Required: invocationId, missionId, stage, stageEpoch, roleId, roleVersion, roleHash, inputDigest, attempt, permitId, workspaceId, status, createdAt, deadlineAt, resourceReservation. Runtime acceptance adds runtimeSessionId and runtimeRunId when known. Runtime-authenticated completion adds actual provider/model, usage, finishedAt, outputArtifactRefs, and outcome. Status is prepared → dispatched → running → succeeded/failed/cancelled/uncertain; a terminal attempt is never reopened. Status updates do not themselves advance the mission.

Attempt starts at 1. Default maxRetries is 1 (at most 2 attempts), separate from mission revisionCount. Every retry gets a new invocation and workspace. A model cannot fill trusted provenance or status fields.

#### Artifact envelope

Required: schemaVersion, artifactId, kind, missionId, invocationId, stageEpoch, roleId, roleVersion, roleHash, actualModel/provider (or explicit deterministic producer/version), inputDigests, candidateDigest when applicable, mediaType, byteLength, payloadHash, createdAt, schemaId/version, envelopeHash. The model supplies payload only. Kernel derives attribution from the admitted invocation and independently computes hashes. Deterministic fixtures must be labelled `fixture`, never a real model.

Hashes use RFC 8785 canonical JSON encoded as UTF-8 for JSON payloads and exact bytes for patch/text/binary payloads. `payloadHash` hashes payload bytes. `envelopeHash` hashes canonical envelope excluding its own hash. Identical JSON payloads with different object key order have identical payload hashes; different provenance produces a different envelope hash. Unicode normalization is not silently applied. A unique artifactId distinguishes equal content submitted in separate invocations.

#### Minimum artifact payloads

| Kind | Required content and validation |
|---|---|
| policy-screen | allowed/restricted/forbidden, scopeDigest, policyVersion, reason codes, evidence, explicit restrictions |
| repository-map | base/tree digest, relevant paths and evidence, conventions, dependencies, unknowns |
| plan | scopeDigest, objective, expected value, risks, effort, ordered work units, permitted paths/actions, test plan, acceptance criteria, estimated budgets |
| challenge | planDigest, independent author, findings with severity/evidence, unresolved objections, recommendation |
| implementation | approved planDigest, base/tree/candidate digests, patch blob, changed paths, implementation summary |
| verification | candidateDigest, trusted test-run receipt, command-template ids, exit codes, logs/hashes, test counts, passed/failed |
| review | candidateDigest, verificationDigest, findings with file/evidence refs, approved/changes_requested |
| documentation | candidateDigest, changed-doc refs or explicit justified no-docs declaration |
| final-package | candidateDigest, planDigest, verification/review/doc refs, exact public text, target/action descriptor or local-only marker, disclosure, remaining risks |
| final-policy | packageDigest, policyVersion, allowed/restricted/forbidden, restrictions and evidence |

A verification prose report without a deterministic runner receipt cannot set passed. Review cannot substitute for tests, and schema validity never proves factual correctness.

### 5. Kernel command interface

One highest-level behavioral seam: submit a command and inspect a mission view/event stream. Storage, runtime, clock, ID generation, and Captain identity are injected adapters. The Kernel does not read the clock or generate IDs inside its reducer; recorded command facts provide deterministic replay.

Every command envelope has schemaVersion, commandId, missionId (except creation), expectedRevision, type, payload. The adapter supplies a non-model-controlled principal: Captain, admitted invocation, trusted runner, or host scheduler. A JSON `actor: captain` string is not authentication.

| Command | Admitted principal | Effect |
|---|---|---|
| CreateMission | Captain | Validate scope/pins/budgets; create CREATED |
| StartMission | Captain or trusted scheduler following creation authorization | Enter POLICY_SCREENING |
| SubmitArtifact | Exact active invocation or trusted runner | Validate and atomically accept artifact; evaluate stage completion |
| DispatchEligible | Trusted scheduler | Reserve budget and persist eligible invocation/outbox intent |
| RecordRuntimeReceipt | Runtime adapter | Correlate acceptance/outcome to exact invocation |
| DecideGate | Authenticated Captain transport only | Approve/reject/request-change current subject |
| AbortMission | Captain | Revoke permits, cancel outstanding work, mark ABORTED |
| ResumeMission | Captain | Reconcile blocked work and resume only when guards hold |
| Tick | Trusted scheduler with recorded time | Expire gates/attempts and enforce deadlines |
| CloseMission | Captain, or Kernel after forbidden policy | Close without publication and retain evidence |

An accepted command returns commandId, resulting revision, disposition, view, and committed event IDs. Repeating an identical commandId/payload/principal returns the original receipt, even if expectedRevision has since advanced; reusing its ID with a changed payload or principal is IDEMPOTENCY_CONFLICT. Otherwise stale expectedRevision produces REVISION_CONFLICT with no effects. Concurrent callers cannot both spend the same revision.

Errors include INVALID_SCHEMA, UNAUTHORIZED, INVALID_TRANSITION, STALE_INVOCATION, STALE_APPROVAL, ARTIFACT_MISMATCH, REVISION_CONFLICT, IDEMPOTENCY_CONFLICT, BUDGET_EXCEEDED, REVISION_LIMIT, POLICY_BLOCKED, RUNTIME_UNAVAILABLE, INTEGRITY_FAILURE, and PUBLICATION_DISABLED. Rejected commands do not create accepted artifacts or mutate workflow state. Security-relevant rejection is a separate append-only audit fact with bounded, redacted diagnostics.

No generic `setStage`, `setStatus`, `approve`, `setTools`, or arbitrary-code execution endpoint is exposed to agents.

CloseMission revokes all permits and cancels/drains outstanding work just like abort; neither operation deletes evidence. ResumeMission cannot change the objective, scope, role pins, original budget ceilings or revision limits. It requires an explicit reconciliation record, confirmed quiescence for uncertain attempts, intact artifacts and restored runtime compatibility. It reevaluates the retained stage guards and expires stale gates before dispatch. Exhausted revision/budget limits cannot be bypassed with resume: close and create a newly approved mission. A gate reissue is a Captain ResumeMission request that atomically creates a new generation after freshness checks, never revives an old grant.

### 6. State transitions and guards

Only current-epoch accepted evidence can satisfy a guard. Every stage entry increments stageEpoch; its branch set is committed before dispatch. Empty optional branches require a recorded skip reason, never silent success. The router's deterministic policy decides branches from pinned mission data, not completion order.

| From | Event / guard | To / action |
|---|---|---|
| CREATED | Scope/pin/budget valid; start authorized | POLICY_SCREENING; invoke Gatekeeper |
| POLICY_SCREENING | Initial allowed verdict; all deterministic rules pass | RECONNAISSANCE |
| POLICY_SCREENING | Restricted verdict with machine-enforceable restrictions | RECONNAISSANCE with narrowed scope; otherwise block |
| POLICY_SCREENING | Forbidden verdict | CLOSED, policy reason, no further dispatch |
| RECONNAISSANCE | Cartographer map plus all required Scout branches accepted | PLANNING |
| PLANNING | First Mate plan accepted | CHALLENGE |
| CHALLENGE | Required independent challenge artifacts accepted; no unresolved blocking finding | AWAITING_PLAN_APPROVAL; freeze plan subject |
| CHALLENGE | Blocking findings | PLANNING for revised plan; bounded by planning budget |
| AWAITING_PLAN_APPROVAL | Captain approves current unexpired plan subject | IMPLEMENTATION |
| AWAITING_PLAN_APPROVAL | Captain requests change | PLANNING; invalidate pending plan gate |
| AWAITING_PLAN_APPROVAL | Captain rejects | CLOSED with rejected plan |
| IMPLEMENTATION | Craftsman or Pólya candidate/patch accepted within approved scope | VERIFICATION |
| VERIFICATION | Trusted runner receipt and Verifier report pass for same candidate | TECHNICAL_REVIEW |
| VERIFICATION | Tests fail | REVISION_LOOP |
| TECHNICAL_REVIEW | Independent Reviewer approves exact candidate/evidence | DOCUMENTATION |
| TECHNICAL_REVIEW | Changes requested | REVISION_LOOP |
| REVISION_LOOP | revisionCount < 2; scope still inside approved plan | Increment revisionCount, invalidate downstream evidence, IMPLEMENTATION |
| REVISION_LOOP | Limit exhausted or scope/budget no longer authorized | Block at REVISION_LOOP; no automatic reset |
| DOCUMENTATION | No repository bytes change; docs/no-docs declaration accepted; package frozen | FINAL_POLICY_GATE |
| DOCUMENTATION | Documentation changes candidate bytes | REVISION_LOOP; reverify and rereview the new complete candidate |
| FINAL_POLICY_GATE | Final Gatekeeper verdict allows exact package and restrictions hold | AWAITING_PUBLISH_APPROVAL |
| FINAL_POLICY_GATE | Forbidden | CLOSED without publication |
| FINAL_POLICY_GATE | Restricted but not enforceable, or missing evidence | Block |
| AWAITING_PUBLISH_APPROVAL | Captain approves exact unexpired package subject | READY_TO_PUBLISH; local preparation only |
| AWAITING_PUBLISH_APPROVAL | Reject | CLOSED |
| AWAITING_PUBLISH_APPROVAL | Request change | REVISION_LOOP for candidate changes; DOCUMENTATION for text-only changes; invalidate final gate/approval |
| READY_TO_PUBLISH | Captain closes or exports local manifest through authorized read interface | CLOSED; no remote action |
| Any nonterminal | Captain aborts | ABORTED, immediate permit revocation, cancellation/drain |
| Any nonterminal | Fatal integrity/pin/runtime uncertainty, deadline, exhausted budget | Block with concrete incident |
| CLOSED / ABORTED | Any workflow mutation | Deny; query/export audit remains allowed |

`PUBLISHED` is reserved for a future adapter with authenticated signed approval consumption and external idempotency/reconciliation. v0.1 MUST reject attempts to enter it, even with a valid package approval.

Six-role bootstrap route: First Mate, Gatekeeper, Cartographer, Craftsman, Verifier, Reviewer. Scout is skipped with local-only reason; CHALLENGE is performed by Reviewer on the plan, independently of First Mate; later Reviewer reviews Craftsman's code. These are different subject artifacts, not self-approval. Oracle and Devil's Advocate branches are enabled only after their role packages exist. Documentation is an explicit no-docs artifact or a Craftsman work item covered by plan and re-verification. No missing role is silently replaced by the output's author.

The final package MUST be prepared before final policy assessment. This resolves the unsafe ordering in which Envoy could change public prose after Gatekeeper review. Later Envoy may assemble the package, but any subsequent byte, target, action, or disclosure change invalidates final policy and publication approval.

### 7. Independence, freshness, and invalidation

- Producer and independent assessor MUST have distinct role identities and distinct runtime sessions for the assessed artifact. Same underlying model is allowed but recorded; it is not evidence of diverse reasoning.
- Verifier cannot edit production files; Reviewer cannot modify requested changes; neither can accept its own implementation.
- Gatekeeper's initial and final assessments are separate artifacts with different subjects. They do not replace Captain consent.
- New candidate digest invalidates verification, review, documentation bindings, final policy, final package and publish consent. Historical artifacts remain immutable.
- New plan/scope digest invalidates plan consent and all dependent evidence. Scope expansion requires initial policy rescreening and new plan approval, not a mutation under an old token; v0.1 closes and creates a new mission for objective/repository-base expansion.
- Initial policy remains valid only for its frozen scope/policy version. Policy changes block the mission pending rescreening under an explicit operator action.
- A late result from an expired, cancelled, superseded, wrong-role, wrong-mission or wrong-epoch invocation is rejected/quarantined, never attached as current evidence.

### 8. Human gates and Captain experience

A gate request contains gateId, missionId, gateKind (plan or package), generation, subjectDigest, policyDigest, createdAt, expiresAt, and exact view revision. Plan subject binds scope, plan, challenges, permitted actions, budget ceilings and role pins. Package subject binds candidate, tests, review, documentation, exact public text, target/action descriptor, disclosure and final policy verdict.

Captain identity comes from an authenticated operator transport outside agent tools. Skeleton tests use an injected test identity and mark approvals simulated. A future web transport must authenticate and authorize the operator, prevent cross-site request forgery and replay, and provide server-side identity; localhost alone is not authentication. Do not put approval secrets or signed bearer tokens into prompts, artifact payloads or sessions.

Approval is a server-stored one-use grant, not a model-readable magic string. Decision and gate-state update are one transaction. Plan grant is consumed when the initial implementation permit is created; its scope remains the authorization envelope for the two permitted corrective cycles. Package grant authorizes only READY_TO_PUBLISH in v0.1, not GitHub writes. Consumed, revoked, expired or different-subject grants cannot be reused. Duplicate identical decision commands return the existing receipt; contradictory decisions at the same generation conflict.

Default gate TTL is 24 hours, persisted at creation. Expiry blocks the gate, rather than approving/rejecting implicitly. Captain may reissue a fresh gate only after freshness checks. Runtime session restart does not widen or recreate consent. Approval unavailable/disabled means no approval; do not translate it into automatic success.

Plan screen: mission, expected value, main risks, effort and budget estimate, plan and challenge findings, recommendation, evidence links; Approve Work / Reject / Request Change / Abort. Package screen: changed files/diff digest, tests, review, remaining risks, exact public text, target/action, disclosure, final Gatekeeper verdict; Approve Package / Reject / Return for Revision / Abort. v0.1 visibly labels “No external publication; local package only”. All actions carry expectedRevision and gate generation; a stale screen must reload, not silently approve newer content.

Blocked screen shows reason, exhausted resource, last accepted artifacts, uncertain effects, and allowed recovery choices. No hidden endless retry. Abort returns workflow acknowledgement promptly; quiescence and external-process termination are separately displayed and measured.

### 9. Durability, concurrency, artifact coordination

Use one single-writer Colony process and a transactional SQLite store on a local supported filesystem for v0.1. Acquire exclusive deployment ownership before dispatch; refuse a second writer. Multi-host leases and network filesystems are out of scope. The storage adapter owns command receipts, append-only mission events, mission projection, invocations, gate grants, artifact metadata and dispatch outbox in transactions. Configure WAL, foreign keys and durable synchronization; acknowledge only after commit succeeds. SQLite dependency choice and version are pinned in the skeleton lockfile.

Mission revision is the optimistic concurrency key. Accepted domain events have per-mission monotone sequence, schema version, timestamp, commandId, principal reference, payload and event digest. Reducer replay from events must reproduce the current projection. A projection is disposable; events and accepted bytes are authoritative. Rejected audit attempts have their own sequence and cannot consume mission revision unexpectedly.

Blob publication protocol: validate size and schema; canonicalize if JSON; hash; write a new private temporary file on the same filesystem; fsync; publish without replacing an existing content-addressed blob; fsync containing directory; then transactionally attach metadata and events. If the blob already exists, check length/hash before reuse. No symlinks, caller-controlled absolute paths, traversal or arbitrary filenames are accepted. Blob root is host-only. Readers verify length/hash; a mismatch blocks affected missions.

A crash before metadata commit may leave an unreferenced blob; it is not an accepted artifact. A crash after acknowledged metadata commit must find durable bytes. Garbage collection is disabled initially; later it requires verified references, retention policy and no active reader/mission use. Human-readable artifact names are manifest aliases, not mutable truth.

Parallel siblings have distinct private inputs/workspaces and distinct invocation IDs. Their results are committed one at a time through Kernel transactions. Join completion is set membership over required current-epoch branches; never “last message wins”. Optional branches are explicitly declared, and one failed required branch blocks join progression after its retry allowance. Successful sibling artifacts remain available and need not be recomputed.

### 10. Runtime dispatch, cancellation and crash recovery

Runtime interface operations: prepare/start one admitted invocation, inspect a known invocation, cancel and await quiescence, and recover durable runtime references. The adapter returns detached JSON receipts and streams owned outcome facts. It may not infer success from agent idle status, enqueue acceptance, or a natural-language closing message. Fake runtime and DSH runtime use the same Colony contract.

Kernel atomically persists invocation intent, budget reservation and outbox entry before calling DSH. DSH acceptance is not the mission commit. Correlate every attempt using invocationId; persist runtime identifiers and verified outcome. SubmitArtifact is idempotent by command ID and invocation provenance. Every effectful tool validates a current permit at actual dispatch, not just at prompt assembly.

DSH does not provide a durable exactly-once mailbox for Colony. On restart, close admission and inspect pending invocations/outbox, actual runtime sessions and committed artifacts. A known complete result can be accepted once if its provenance passes. A known live invocation is reattached only after restoring guards and role pins. An accepted-but-unlogged or otherwise uncertain invocation is marked uncertain and blocks; do not blindly resend it. Read-only or private disposable work may be retried in a new workspace after the old execution is proven quiescent. Unknown external side effects require manual reconciliation; external effects are disabled in v0.1.

Timeout cancels the role, revokes its permit and waits for owned operations to stop. Cancellation is not rollback. After a 10-second cooperative grace period, an external supervisor must terminate the isolated worker/process group and verify exit before a retry. If hard termination is unavailable, block; do not claim the timeout physically stopped a same-process tool. Late output after revocation is rejected. Aborting is monotonic and preempts later state transitions even if a result races with it.

### 11. Budgets and retries

Default local mission limits: 20 invocations, 2 concurrent role invocations, 200 tool calls, 100,000 total accounted input/output tokens, 4 hours elapsed execution time, 45 minutes per invocation, 1 retry per role attempt chain, 2 implementation revision cycles, and 2 plan rework cycles. Human waiting time is excluded from execution elapsed time but gate TTL still applies. Operator supplies an explicit cost ceiling and pinned rate table before paid/live execution; unavailable pricing/usage is unknown, not zero.

Before dispatch, reserve worst-case bounded request output/cost and a tool-call slot; before each further model step, reserve its bounded input/output cost. If the provider cannot enforce/report an upper bound, live budgeted execution is unsupported and blocks. Reconcile actual usage once per request/attempt using durable IDs; cached tokens count according to the pinned rate table. Failed requests and retries consume budget. Unknown settlement keeps its reservation until operator reconciliation.

Retry only transient runtime failures or schema-invalid output, after quiescence. Retry feedback is bounded validation detail, not full uncontrolled artifact copying. Authorization denial, forbidden policy, exhausted budget, integrity failure, and invalid pin are not auto-retryable. Test failure is a revision outcome, not an infrastructure retry. Backoff schedule is recorded and bounded (default one retry after 1 second); no retry at a human gate. Nested provider retries must be observable and included or disabled by adapter configuration.

### 12. Capabilities and isolation

Effective permission = deployment maximum ∩ capability class ∩ role restrictions ∩ mission scope ∩ stage permit. Capability class names are policy identifiers, not claims about security merely because a profile has that name.

| Class | Allowed ceiling | Always denied in v0.1 |
|---|---|---|
| colony-readonly | Read immutable allowed repository/evidence; curated history/search | Production writes, publish, arbitrary shell/network |
| colony-research | Read approved web/GitHub targets and materialize public clone into own workspace through mediated adapter | Remote writes, credentials, unrestricted network; all network in local dry run |
| colony-builder | Private candidate edits and approved isolated test templates | Host paths, shared workspace, publish, unrestricted shell/network |
| colony-release | Prepare local exact action text/package | Every remote write, even after package approval |

Verifier uses the builder ceiling narrowed to test-only scratch output and a read-only production snapshot. Test authoring may occur in a separate overlay, but cannot edit production inputs or claim a modified test environment as the original one. Reviewer/Cartographer get read-only snapshots. First Mate receives planning/artifact interfaces, no production write capability. Gatekeeper uses local policy/evidence reads in the bootstrap route.

Do not secure bash through a list of forbidden command substrings. For live execution, tools are mediated high-level operations or trusted command templates executed in an externally isolated environment. Unknown tools and newly registered names are denied by an allowlist plus execution guard. Native calls, nested code calls, filesystem APIs and runner operations all enforce the same permit. Dynamic plugin creation, profile edits, unrestricted delegation, secret reads and policy mutation are absent from specialist tools.

One mission workspace; inside it one private workspace per invocation, not just per role (retries cannot race). Read-only repository base; privately materialized candidate; host-only artifact store and Kernel database. No writable shared file between agents. Promoting a candidate occurs through validated artifact publication, not by letting agents overwrite another role's tree. Reject path escapes/symlinks; externally mount only intended resources.

DSH file sandbox and scoped tool visibility are defense in depth, not isolation for network/processes/secrets or malicious plugins. Disposable container/VM with unprivileged UID, no host home/config mounts, no Docker socket, no ambient credentials, restricted network, resource limits and process-tree termination is required before real untrusted code/test execution. Snapshot/backup the mission base before write work and verify restoration. These requirements are deployment gates, not properties achieved by this specification.

### 13. Role packages and migration

Freeze existing source material without executing it. Current local inventory reports 16 mirrored personalities; the requested “about 19” drafts are not all accounted for. Do not invent missing sources or silently rename existing roles. Source migration uses an explicit source-to-role manifest with SHA-256, original name, provenance, copyright/license where known, and review status. Existing mirrors remain intact; copied source becomes immutable historical input.

Bootstrap roles: First Mate, Gatekeeper, Cartographer, Craftsman, Verifier, Reviewer. Existing First Mate and Gatekeeper names match local files, but semantic equivalence of critic→Reviewer or contributor→Craftsman is **not approved**. Cartographer/Verifier and any missing full Anatomy require a sourced import or clearly labelled bootstrap fixture, not fabricated long Anatomies. Fixture contracts suffice for Milestone 1 only.

Role registry validates exact id/version, type (agent/hybrid/service/skill), purpose, owned responsibilities, forbidden operations, invoke conditions, input/output schema references, capability class, parent/downstream relationships, timeout/retries, curated-only memory, content manifest and eval requirements. Duplicate active IDs or exclusive ownership keys are rejected transactionally. Different historical versions may coexist, but one active version per role is selected for a mission. Role replacement never hot-swaps an in-flight mission.

Runtime package contains compact SOUL, ROLE, stage PLAYBOOK, HANDOFFS and FAILURE_MODES; schemas and four eval groups (smoke, role adherence/boundaries, adversarial, domain); stable knowledge and dated current knowledge with source manifest; VERSION and CHANGELOG. Full Anatomy stays outside normal prompt assembly. SOUL target is 800–1500 tokens measured with the serving tokenizer when available; estimates must be labelled. This is a target, not a justification to pad absent sources.

Later classifications: Scout, Pólya, Devil's Advocate, Scribe, Envoy, Tutor and Debugger are conditional reasoning agents; Oracle and Steward are hybrid deterministic/model modules. Attendant is measured observability. Chronicler is an on-demand case-study capability with deterministic scheduling, not a permanently running agent. Golomb is a mathematics skill for Pólya. Voice Editor is an on-demand prose capability: consistency/clarity, no fake mistakes or detector evasion.

### 14. Prompt compiler and memory

Compiler produces a detached section plan in order: global constitution, role SOUL, role contract, current mission, stage-specific playbook, selected artifacts, current knowledge, output schema. Stable prefix is versioned; dynamic selections bind their hashes to the invocation. Preserve DSH protocol/tool guidance and higher-priority deployment instructions. Do not use a complete-prompt override merely to hide required runtime protocols.

Input selection is deterministic for a fixed mission/role/stage and retrieval result. Do not render arbitrary repository content as system instructions. Label quoted artifacts, source claims and web text as untrusted evidence. Escape/transport literal content without accidentally interpreting template syntax. Never recursively serialize live DSH objects. Prompt budget overflow drops optional context in a documented order; it may not truncate constitution, role prohibitions or output schema. If required material cannot fit, block with CONTEXT_BUDGET rather than send a malformed request.

Current knowledge has generatedAt, expiresAt, source refs and verification status. Future-dated, expired or unverified current claims are excluded by default; a required missing policy fact blocks the relevant step. No unearned `sources_verified: true`. Stable knowledge and source literature are selectively retrieved, not appended in full.

Memory planes: mission state is durable Kernel truth; DSH session history is runtime evidence; chat memory starts clean per mission (no cross-mission forks); institutional memory is explicitly curated, versioned, attributed and retrieved narrowly. A proposed lesson does not enter trusted retrieval until reviewed. No free-form automatic agent memory. First skeleton retrieval returns empty, honestly.

### 15. Telemetry and retention

Record mission/stage/invocation/role/model IDs, timestamps and measured durations, token usage with provenance, rate-table/cost calculation, tool attempts/denials, retries, empty output, schema failures, handoff failures, approval interventions, cancellation/quiescence lag, result status and incident IDs. Use null/unknown for unavailable measures, not made-up zeroes. No emotional or anthropomorphic health scores.

Durable workflow/audit facts must commit even if an optional metrics exporter fails. Metrics are derived views and cannot approve work. Redact secrets; never log full prompts, approval credentials or arbitrary environment dumps in telemetry. Retain mission evidence until explicit operator retention policy and backup verification; no automatic deletion in v0.1.

## Testing Decisions

Primary proposed seam: Kernel command submission plus mission/event/artifact queries. Exercise callers' visible behavior, not private reducer helpers. Fake runtime, fake clock, isolated disk store and injected Captain principal make tests deterministic. A separate adapter conformance suite is required because fake tests do not prove DSH composition or OS isolation. These seams are specified for implementation review; no live-model experiment is authorized by them.

There is no existing Colony test suite in the inspected lab. Historical lab results are not prior passing tests for this Kernel. Add table-driven acceptance tests with these IDs and record the actual command/result evidence when implemented:

| ID | Acceptance behavior |
|---|---|
| A01 | Full local happy path reaches READY_TO_PUBLISH then CLOSED; no remote action |
| A02 | Forbidden initial policy closes before any specialist dispatch |
| A03 | Unknown/non-enforceable restricted policy blocks |
| A04 | Every disallowed transition and unknown command fails without workflow effects |
| A05 | No implementation before exact plan approval; forged agent approval fails |
| A06 | No package readiness without tests, independent review, final policy and Captain decision |
| A07 | Old/replayed/expired/wrong-mission approval cannot authorize new subject |
| A08 | Duplicate command returns same receipt; changed payload under same ID conflicts |
| A09 | Competing expectedRevision commands yield one commit and one conflict |
| A10 | Invalid schema/oversize payload creates no accepted artifact |
| A11 | Trusted provenance cannot be overwritten by model payload |
| A12 | Equal canonical payload yields stable hash; byte or metadata tampering is detected |
| A13 | Cross-mission/wrong-epoch/late cancelled result never advances state |
| A14 | Parallel join waits for all required branches regardless of completion order |
| A15 | Required-branch failure preserves siblings but blocks after bounded retry |
| A16 | Self-assessment and Reviewer implementation attempts are denied |
| A17 | Verifier cannot mutate production bytes; measured runner failure cannot be prose-overridden |
| A18 | Candidate change invalidates all downstream verdicts and publish approval |
| A19 | Documentation edits reenter verification/review rather than skipping them |
| A20 | Two revision cycles allowed; third blocked without resetting count |
| A21 | Budgets reserved atomically; concurrency cannot overspend; unknown usage keeps reservation |
| A22 | Timeout/abort revokes permit and rejects late results; retry waits for proven quiescence |
| A23 | Crash before blob publish, after publish, before commit, after commit preserves defined acceptance |
| A24 | Restart replay reproduces mission view and gate bindings; unknown schema fails closed |
| A25 | Crash after runtime acceptance but before receipt does not blindly redispatch |
| A26 | Second writer fails startup; missing/corrupt blob blocks affected mission |
| A27 | Role duplicate ownership/pin mismatch rejected; live mission role cannot hot-swap |
| A28 | Prompt order/budget/source exclusion and expired knowledge behavior are reproducible |
| A29 | Plugin mount/unmount leaves no listeners, tools, handles, timers or open writer resources |
| A30 | DSH scoped setup restricts known and future/nested tools; native adapter reports real outcomes |
| A31 | External isolation rejects host/sibling path and network access; process timeout terminates descendants |
| A32 | Ten clean independently isolated dry runs, with reproducible hashes and zero unauthorized dispatched calls |
| A33 | GitHub write/PUBLISHED remains disabled after valid package approval |
| A34 | Stale UI action conflicts; approval-disabled configuration never grants consent |
| A35 | Backup restores original mission base; historical lab assets unchanged |

Denial tests intentionally attempt prohibited actions: count attempted vs actually dispatched calls separately. “Zero unauthorized calls” means zero unauthorized dispatch/effects, not hiding denied attempts. A32 is necessary but not sufficient for public deployment. Schema/fixture tests cannot prove role expertise; each live role still needs smoke, boundary, adversarial and domain eval evidence.

## Out of Scope

- LangGraph, a new agent loop, flat multi-agent group chat, automatic role creation.
- Running all existing personalities or modifying their profiles/model routes.
- Live model execution in the first skeleton; restarting historical experiments.
- Production GitHub writes, tokens, PR/comment creation, detector evasion or deceptive attribution.
- Distributed mission scheduling, multi-host writer leases, network-filesystem durability.
- Automatic memory injection, unrestricted shell/network, untrusted host plugins.
- Claiming the file sandbox is a security boundary or that a hash proves an artifact is correct.
- Full graph visualization and deploy-ready Captain Web UI in Milestone 1.

## Further Notes

### Delivery sequence and exit criteria

0. **Freeze:** inventory sources, preserve existing lab, document unmapped roles; no runtime changes.
1. **Skeleton:** closed contracts, public command seam, reducer/transactions, immutable store, role registry, fake runtime, human-gate tests, deny-publication adapter, disposable Cordis mount test. Typecheck and deterministic tests pass; no real agents.
2. **Six roles:** reviewed source mappings and runtime packages, prompt compiler, role evals, DSH adapter with verified pin and isolated capability composition.
3. **Local dry run:** fix a deliberately controlled bug in a disposable repository; baseline test fails before change, passes after candidate, independent review and both gates; no web/GitHub. Record real evidence, not just a simulated successful trace.
4. **Conditional roles:** add Scout/Tutor/Pólya/Devil's Advocate/Scribe/Envoy with evals before enabling routes.
5. **Institutional layer:** curated Steward memory, deterministic Oracle statistics, Debugger, telemetry and conditional Chronicler.
6. **Deployment readiness:** ten clean dry runs plus crash/resume, consent, isolation, backup and hash evidence. Public execution remains a separate Captain-approved version/deployment decision, never implied by test success.

### Completion definition for this specification

The specification is complete when the state transitions, failure paths, data/provenance contracts, consent bindings, durable dispatch/recovery, module responsibilities, isolation limits, migration gaps and acceptance criteria are explicit, and a coding agent can build Milestone 1 without inventing policy. It does not require claiming later milestones have been delivered. Verified local DSH observations and implementation handoff accompany this document; runtime signatures must be rechecked against the locked adapter build before code is written.
