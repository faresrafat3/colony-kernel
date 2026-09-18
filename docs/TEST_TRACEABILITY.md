# Test traceability — Milestone 1A

All tests below actually RAN in this milestone (vitest, Node v26.8.2, two consecutive full runs, 66/66 passing both times). Planned-but-not-run specification tests are mapped in the next section and are NOT claimed as passing.

## Implemented M1A tests

| Test ID | Suite | Test file | Result |
|---|---|---|---|
| A-01 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| A-02 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| A-03 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| A-04 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| A-05 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| A-06 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| A-07 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| A-08 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| A-09 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| A-10 | A. state machine | tests/.../state-machine.test.ts | PASS (ran) |
| B-01 | B. events | tests/.../events.test.ts | PASS (ran) |
| B-02 | B. events | tests/.../events.test.ts | PASS (ran) |
| B-03 | B. events | tests/.../events.test.ts | PASS (ran) |
| B-04 | B. events | tests/.../events.test.ts | PASS (ran) |
| B-05 | B. events | tests/.../events.test.ts | PASS (ran) |
| B-06 | B. events | tests/.../events.test.ts | PASS (ran) |
| B-07 | B. events | tests/.../events.test.ts | PASS (ran) |
| B-08 | B. events | tests/.../events.test.ts | PASS (ran) |
| B-09 | B. events | tests/.../events.test.ts | PASS (ran) |
| C-01 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| C-02 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| C-03 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| C-04 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| C-05 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| C-06 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| C-07 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| C-08 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| C-09 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| C-10 | C. approvals | tests/.../approvals.test.ts | PASS (ran) |
| D-01 | D. artifacts | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| D-02 | D. artifacts | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| D-03 | D. artifacts | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| D-04 | D. artifacts | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| E-01 | E. budgets | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| E-02 | E. budgets | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| E-03 | E. budgets | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| E-04 | E. budgets | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| E-05 | E. budgets | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| E-06 | E. budgets | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| E-07 | E. budgets | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| E-08 | E. budgets | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| E-09 | E. budgets | tests/.../artifacts-budgets.test.ts | PASS (ran) |
| F-01 | F. roles | tests/.../roles-runtime.test.ts | PASS (ran) |
| F-02 | F. roles | tests/.../roles-runtime.test.ts | PASS (ran) |
| F-03 | F. roles | tests/.../roles-runtime.test.ts | PASS (ran) |
| F-04 | F. roles | tests/.../roles-runtime.test.ts | PASS (ran) |
| F-05 | F. roles | tests/.../roles-runtime.test.ts | PASS (ran) |
| F-06 | F. roles | tests/.../roles-runtime.test.ts | PASS (ran) |
| F-07 | F. roles | tests/.../roles-runtime.test.ts | PASS (ran) |
| G-01 | G. runtime | tests/.../roles-runtime.test.ts | PASS (ran) |
| G-02 | G. runtime | tests/.../roles-runtime.test.ts | PASS (ran) |
| G-03 | G. runtime | tests/.../roles-runtime.test.ts | PASS (ran) |
| G-04 | G. runtime | tests/.../roles-runtime.test.ts | PASS (ran) |
| G-05 | G. runtime | tests/.../roles-runtime.test.ts | PASS (ran) |
| G-06 | G. runtime | tests/.../roles-runtime.test.ts | PASS (ran) |
| G-07 | G. runtime | tests/.../roles-runtime.test.ts | PASS (ran) |
| G-08 | G. runtime | tests/.../roles-runtime.test.ts | PASS (ran) |
| H-01 | H. recovery | tests/.../recovery-isolation.test.ts | PASS (ran) |
| H-02 | H. recovery | tests/.../recovery-isolation.test.ts | PASS (ran) |
| H-03 | H. recovery | tests/.../recovery-isolation.test.ts | PASS (ran) |
| H-04 | H. recovery | tests/.../recovery-isolation.test.ts | PASS (ran) |
| H-05 | H. recovery | tests/.../recovery-isolation.test.ts | PASS (ran) |
| I-01 | I. isolation | tests/.../recovery-isolation.test.ts | PASS (ran) |
| I-02 | I. isolation | tests/.../recovery-isolation.test.ts | PASS (ran) |
| I-03 | I. isolation | tests/.../recovery-isolation.test.ts | PASS (ran) |
| I-04 | I. isolation | tests/.../recovery-isolation.test.ts | PASS (ran) |

## Planned specification tests (66 per v0.1.1 series sizes; 65 distinct IDs enumerated in TEST_PLAN_AUDIT.md)

Designations: IMPLEMENTED_M1A = an equivalent deterministic test exists and ran in this milestone (mapped above); DEFERRED_M1B = needs the SQLite/workspace slice; DEFERRED_M2 = needs the DSH adapter and the passed independent review; NOT_APPLICABLE_TO_M1A = no M1A surface.

| Planned ID | Series | Designation | Mapping |
|---|---|---|---|
| T-U01 | A (unit) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-02 durable rejection) |
| T-U02 | A (unit) | DEFERRED_M1B | DEFERRED_M1B (parallel branch join, A14) |
| T-U03 | A (unit) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (E-01/E-03/E-09 ledger) |
| T-U04 | A (unit) | DEFERRED_M1B | DEFERRED_M1B (deadline revocation, A22) |
| T-U05 | A (unit) | DEFERRED_M2 | DEFERRED_M2 (prompt assembly, A28) |
| T-U06 | A (unit) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (B-08 unsupported version fails closed) |
| T-B01 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-01/A-04) |
| T-B02 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-02) |
| T-B03 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-03) |
| T-B04 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-05) |
| T-B05 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-07) |
| T-B06 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-06) |
| T-B07 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-08) |
| T-B08 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-09) |
| T-B09 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-10) |
| T-B10 | B (transitions) | DEFERRED_M1B | DEFERRED_M1B (A11 provenance overwrite) |
| T-B11 | B (transitions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-09/B-09 canonical hash) |
| T-B12 | B (transitions) | DEFERRED_M1B | DEFERRED_M1B (A15 required-branch failure) |
| T-C01 | C (approvals) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-01) |
| T-C02 | C (approvals) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-02) |
| T-C03 | C (approvals) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-03) |
| T-C04 | C (approvals) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-04/C-10) |
| T-C05 | C (approvals) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-05) |
| T-C06 | C (approvals) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-06) |
| T-C07 | C (approvals) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-07) |
| T-C08 | C (approvals) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-08) |
| T-D01 | D (artifacts) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (D-01) |
| T-D02 | D (artifacts) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (D-02) |
| T-D03 | D (artifacts) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (D-03) |
| T-D04 | D (artifacts) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (D-04) |
| T-E01 | E (events/persistence) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (B-01/B-02) |
| T-E02 | E (events/persistence) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (B-03) |
| T-E03 | E (events/persistence) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (B-04) |
| T-E04 | E (events/persistence) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (B-05) |
| T-E05 | E (events/persistence) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (H-01/H-04) |
| T-E06 | E (events/persistence) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (I-01/I-03) |
| T-E07 | E (events/persistence) | DEFERRED_M1B | DEFERRED_M1B (I-02 workspace escape, N8 real FS) |
| T-F01 | F (budgets) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (E-01/E-02) |
| T-F02 | F (budgets) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (E-03) |
| T-F03 | F (budgets) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (E-04) |
| T-F04 | F (budgets) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (E-05/E-06) |
| T-F05 | F (budgets) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (E-07) |
| T-F06 | F (budgets) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (E-08) |
| T-F07 | F (budgets) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (F-01/F-02) |
| T-F08 | F (budgets) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (F-04) |
| T-G01 | G (roles/permissions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (C-07) |
| T-G02 | G (roles/permissions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (F-05) |
| T-G03 | G (roles/permissions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (A-08/A-10) |
| T-G04 | G (roles/permissions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (G-01–G-05) |
| T-G05 | G (roles/permissions) | DEFERRED_M1B | DEFERRED_M1B (N3 crash matrix) |
| T-G06 | G (roles/permissions) | DEFERRED_M1B | DEFERRED_M1B (N3 duplicate receipt) |
| T-G07 | G (roles/permissions) | DEFERRED_M2 | DEFERRED_M2 (translation boundary, N9) |
| T-G08 | G (roles/permissions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (I-04) |
| T-G09 | G (roles/permissions) | DEFERRED_M2 | DEFERRED_M2 (lifecycle cleanup, N9 reqs 5–6) |
| T-G10 | G (roles/permissions) | DEFERRED_M2 | DEFERRED_M2 (unload/reload) |
| T-G11 | G (roles/permissions) | DEFERRED_M2 | DEFERRED_M2 (compat probe) |
| T-G12 | G (roles/permissions) | DEFERRED_M2 | DEFERRED_M2 (missing symbol fails startup) |
| T-G13 | G (roles/permissions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (F-03 no self-mutation) |
| T-G14 | G (roles/permissions) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (F-06 no publication) |
| T-G15 | G (roles/permissions) | DEFERRED_M2 | DEFERRED_M2 (pinned-route reproducibility set) |
| T-H01 | H (DSH adapter) | DEFERRED_M2 | DEFERRED_M2 (adapter lifecycle residue) |
| T-H02 | H (DSH adapter) | DEFERRED_M2 | DEFERRED_M2 (scoped-setup restriction) |
| T-H03 | H (DSH adapter) | DEFERRED_M2 | DEFERRED_M2 (outcome fidelity) |
| T-I01 | I (migration/versioning) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (B-08 unsupported version → read-only diagnostic) |
| T-I02 | I (migration/versioning) | DEFERRED_M1B | DEFERRED_M1B (migration execution, N5) |
| T-I03 | I (migration/versioning) | IMPLEMENTED_M1A | IMPLEMENTED_M1A (B-08/C-10 version separation) |
| T-S02 | S (SQLite integration) | DEFERRED_M1B | DEFERRED_M1B (SQLite atomicApply) |
| T-S03 | S (SQLite integration) | DEFERRED_M1B | DEFERRED_M1B (SQLite uniqueness) |
| T-S04 | S (SQLite integration) | DEFERRED_M1B | DEFERRED_M1B (SQLite leases) |
| T-S05 | S (SQLite integration) | DEFERRED_M1B | DEFERRED_M1B (SQLite artifact immutability) |
| T-S06 | S (SQLite integration) | DEFERRED_M1B | DEFERRED_M1B (SQLite rollback) |
| T-S07 | S (SQLite integration) | DEFERRED_M1B | DEFERRED_M1B (SQLite crash recovery) |

## Notes

- M1A implements 66 executable tests (per-test names and results in `reports/milestone-1a-manifest.json`).
- No planned test is marked passed unless an equivalent deterministic test actually ran in this milestone.
- The packet enumerates 65 distinct planned IDs while the v0.1.1 verdict cites 66 (series G15). The discrepancy is a packet observation recorded in `docs/SPEC_DEVIATIONS.md` §6 and flagged for the independent review; it is not resolved here.
- Real filesystem enforcement (A17), serving-model prompt behavior (A28), live DSH admission (A30), external isolation (A31), ten dry runs (A32) and backup restoration (A35) require later integration evidence and are DEFERRED.
