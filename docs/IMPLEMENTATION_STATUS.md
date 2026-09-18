# Implementation Status — Milestone 1A

Normative basis: `docs/colony-kernel-v0.1.1.md` (sha256 d3c8e715c09c446c2934d1177bb86b3f762e7cce055d28f0fa2739dc8b1af841). Toolchain: Node v26.8.2, npm 11.19.1, Linux x86_64. Lockfile sha256: f13a57fd571abb63434975ef53b9706413a4ad4f1b554822a29d3329a2013d93. Runtime dependencies: none. Dev dependencies (exact): typescript 5.9.3, vitest 5.0.1, eslint 10.10.0, @typescript-eslint/{parser,plugin} 8.70.0, prettier 3.9.7, @types/node 22.20.3.

## Implemented (with honest labels)

| Area | Status | Coverage label |
|---|---|---|
| Closed 40-type event vocabulary, envelopes, payload hashing | IMPLEMENTED (deterministic unit tests) | simulated |
| 22-state machine, default-deny edge table, generated table + Mermaid | IMPLEMENTED | simulated |
| Apply-once reducer: sequence/CAS/payload-hash/unknown-type fail-closed | IMPLEMENTED | simulated |
| Content-addressed approvals (RFC 8785 JCS subject hash), consumption-at-most-once, expiry-at-commit, replay/purpose/self-approval rejection | IMPLEMENTED (expiry enforced at consumption; C-04/C-10 assert refusal, durable rejection, and no consumption) | simulated |
| Budget ledger: immutable limit, CAS rows, reserve/settle/release, restricted top-ups, INTEGRITY_FAILURE on limit mutation | IMPLEMENTED | simulated |
| Roles/capabilities: deny-by-default registry, no self-mutation, no publication capability | IMPLEMENTED | simulated |
| Artifacts: content-addressed, immutable finalization, idempotent re-finalization | IMPLEMENTED | simulated |
| FakeAgentRuntime: scripted success/malformed/timeout/refusal/infra-failure/duplicate, zero I/O | IMPLEMENTED | simulated |
| InMemoryColonyStorage: staged transactions, unique eventId/(mission,seq)/idempotency, leases, durable rejections | IMPLEMENTED | simulated |
| Deterministic demo: full legal path, both gates, CLOSED, byte-identical reruns | IMPLEMENTED | simulated |
| Recovery: replay == stored state; crash-after-finalize harmless; pause/resume counters | IMPLEMENTED | simulated |

## Explicitly deferred

- SQLiteColonyStorage (M1B; N7 names it for deterministic integration tests).
- ToolInvocation outbox + crash matrix (N3) — reduced support only (informational events, RECONCILIATION_REQUIRED edge); full crash-matrix tests M1B.
- MigrationPolicy execution (N5): interface + unsupported-version fail-closed only (schemaVersion validation everywhere); forward-only migration engine M1B.
- Workspace filesystem isolation (N8): path/traversal/symlink enforcement is a filesystem-layer concern; only the mission-isolation model is testable in-memory. M1B with real workspace adapter.
- colony-dsh-adapter + pin paths (N9): M2; requires completed independent review first.
- A14 parallel-branch join semantics, A22 permit revocation on timeout, A26 second-writer full startup flow (lease primitive exists), A32 ten dry runs — deferred with the slices above; see TEST_TRACEABILITY.md.

## Quality gates (actual results)

1. TypeScript strict compilation: PASS. 2. ESLint: 0 errors. 3. Tests: 66/66 PASS (two runs). 4. Demo twice: byte-identical, event-log hash 3098dcc2c7038e4309f922e5eeea75acfb2efdcdd6658bf79d703f41a39901a1, final CLOSED v23. 5. No DSH import: verified by grep sweep. 6. No network: no http/net/fetch/DNS imports; no URLs in source. 7. No model calls: FakeAgentRuntime only. 8. Normative inputs byte-identical post-build (hashes above). 9. No public-action implementation (PUBLIC_ACTION_* fail closed with PUBLICATION_DISABLED). 10. All sources under colony-kernel/. 11. schemaVersion on every persisted type. 12. All state changes flow through events. 13. No known unresolved P0 in the M1A surface. 14. Deferred work listed here. 15. Independent review PENDING (PENDING_RATE_LIMIT); the review workspace is external to this repository and was untouched by this release. 16. Post-1A review fixes: expiry-at-commit now enforced (EXPIRED_AT_COMMIT + durable rejection); canonical subject sort unified on the domain tuple comparator (event-log hash updated accordingly); dead `purposeMatchesTransition` helper removed.

**Coverage honesty:** everything here is simulated deterministic coverage (fake runtime, in-memory storage, injected clock/IDs). No simulated receipt is labelled real verification.
