# TRACEABILITY.md — Table C skeleton (§15)

Requirement → business rules → conditions → carrier (Table B case **or** automated test file).
The **Result** and **Defect** columns are populated during Phases 13–14 against the frozen baseline.

`packages/core/tests/unit/traceability.test.ts` enforces that **every non-system condition below
appears in at least one test file** — Table C has no orphans by construction.

| Requirement | Business rules | Conditions | Carrier (TC-nn or test file) |
|---|---|---|---|
| FR1 — 3.2.1.1–.4 | BR-01, 02, 03 | COND-01…03 | `core/tests/unit/framing.test.ts` |
| | | COND-04, 05 | `agent/tests/component/unicast-transport.test.ts` |
| | | COND-06 | **TC-02** · `control-plane/tests/integration/fr1-unicast.test.ts` |
| | | COND-07, 08 | **TC-03** · `fr1-unicast.test.ts` + `core/tests/unit/validator-and-sequence.test.ts` |
| | | COND-09 | `unicast-transport.test.ts` + `fr1-unicast.test.ts` |
| | | COND-10 | **TC-01** — manual, SRS UC2 (Phase 13) |
| FR2 — 3.2.2.3–.6, .9 | BR-04, 05, 06, 07 | COND-11, 12, 13 | `agent/tests/component/membership-and-multicast.test.ts` |
| | | COND-14 | `control-plane/tests/integration/fr2-6-7.test.ts` |
| | | COND-15 | `control-plane/tests/integration/fr2-fr3-delivery.test.ts` |
| | | COND-16 | **TC-06** · `fr2-fr3-delivery.test.ts` |
| | | COND-17 | **TC-04** — manual, SRS UC1 (Phase 13) |
| | | COND-18 | **TC-05** · `fr2-6-7.test.ts` |
| FR3 — 3.2.2.1, .2, .7, .8 | BR-08, 09, 10, 11 | COND-19, 25 | `core/tests/unit/framing.test.ts` |
| | | COND-20 | `membership-and-multicast.test.ts` |
| | | COND-21 | **TC-07** · `control-plane/tests/integration/fr3-ttl.test.ts` |
| | | COND-22 | **TC-08 (executed, expected FAILED)** · `fr3-ttl.test.ts` — no workaround (§14.1) |
| | | COND-23 | `agent/tests/component/security-and-config.test.ts` |
| | | COND-24 | **TC-09** · `validator-and-sequence.test.ts` + `membership-and-multicast.test.ts` + `fr3-ttl.test.ts` |
| | | COND-26 | `fr2-fr3-delivery.test.ts` |
| | | COND-27 | manual, SRS UC3 (Phase 13) |
| FR4 — 3.2.3.1–.3 | BR-12, 13 | COND-28, 31, 32 | `agent/tests/component/broadcast-keyholder-misc.test.ts` |
| | | COND-29 | **TC-10** · `control-plane/tests/integration/fr4-broadcast.test.ts` |
| | | COND-30 | **TC-11 (BLOCKED — single host)** — manual (Phase 13) |
| | | COND-33 | manual, SRS UC4 (Phase 13) |
| FR5 — 3.2.4.1–.4 | BR-14, 15, 16, 17 | COND-34, 35, 36, 54 | `core/tests/unit/crypto.test.ts` |
| | | COND-37 | **TC-12** · `agent/tests/component/security-and-config.test.ts` |
| | | COND-38, 39 | **TC-13** · `control-plane/tests/integration/fr5-fr6-security.test.ts` |
| | | COND-40 | `crypto.test.ts` + `security-and-config.test.ts` |
| FR6 — 3.2.4.5, .6 | BR-18, 19, 20 | COND-41, 42 | **TC-14** · `broadcast-keyholder-misc.test.ts` + `fr2-6-7.test.ts` |
| | | COND-43, 44, 45 | `fr5-fr6-security.test.ts` |
| FR7 — 3.2.5.1, .2 | BR-21 | COND-46 | `broadcast-keyholder-misc.test.ts` |
| | | COND-47, 48 | `control-plane/tests/integration/fr7-architecture.test.ts` |
| | | COND-49 | **TC-15** — manual + `fr2-6-7.test.ts` marker check |
| NFR8 — 3.2.6.1 | BR-22 | COND-50 | `broadcast-keyholder-misc.test.ts` |
| | | COND-51 | manual, Part 3A (Phase 13) |
| NFR9 — 2.4.1 | BR-23 | COND-52 | `core/tests/unit/traceability.test.ts` (static inspection) |
| | | COND-53 | `fr2-fr3-delivery.test.ts` |
| NFR10 — 2.4.2 | BR-24 | COND-54 | `crypto.test.ts` + `fr5-fr6-security.test.ts` |

**System-level conditions (COND-10, 17, 27, 33, 49, 30, 51)** are executed by a person through the
harness in Phase 13, per the brief — they are deliberately not in the automated suite (plan §12.2).
