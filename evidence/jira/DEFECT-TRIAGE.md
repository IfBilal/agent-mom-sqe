# Defect Triage Register — agentMom SE3002 (in place of a Jira export)

**Purpose.** The assignment requires "Jira defect evidence/export for confirmed, reproducible
defects." Triage of every FAILED/BLOCKED test case (Part 3.B) and every SonarQube finding with a
plausible functional angle (Part 3.A) produced **zero confirmed, reproducible implementation
defects** — see the four investigations below. Per plan §18.2, *"a submission with two genuine
failures and zero Jira defects is a valid outcome, provided the investigation is documented."*
This file is that documentation: the audit trail a marker can check in place of a Jira board.

**Baseline under test:** commit `e79b197` (see `evidence/BASELINE_TAG_HASH.txt`).
**Triage date:** 2026-09-07.

Defect rule of thumb applied to every candidate (assignment Part 4): a Jira entry needs (a) a test
that was actually executed, (b) an actual result that didn't match the expected result, (c) a
reproduction confirmed at least twice, and (d) no already-declared assumption/deviation that
explains it away. All four candidates below fail criterion (b), (d), or both.

---

## Candidate 1 — TC-08 / COND-22 (setMulticastTTL(0) confinement)

| Field | Value |
|---|---|
| Source | Table B, FR3 |
| (a) Executed? | Yes — `fr3-ttl.test.ts`, every `npm test` run |
| (b) Actual ≠ expected? | Yes, at the SRS level (§1.3): confinement did not occur |
| (c) Reproduced ≥2×? | Yes — deterministic every run |
| (d) Already explained? | **Yes** — `DEVIATIONS.md` D-5: single-host test bed has no router; SRS §1.3 defines TTL as router-hop count. The implementation calls the OS API correctly; the mechanism has nothing to act on without a router in the path. |
| **Verdict** | **Not a defect.** Environment limitation, declared in advance. |

## Candidate 2 — TC-11 / COND-30 (LAN-wide broadcast reach)

| Field | Value |
|---|---|
| Source | Table B, FR4 |
| (a) Executed? | **No — BLOCKED.** Precondition (≥2 hosts on the LAN) does not exist. |
| (b) Actual ≠ expected? | N/A — nothing executed to compare |
| (c) Reproduced? | N/A |
| (d) Already explained? | **Yes** — `ASSUMPTIONS.md` A4.1/A4.2; `scripts/verify-preconditions.sh` confirms one host |
| **Verdict** | **Not a defect.** Precondition never met; TC-10 already confirms host-local send/receive logic is correct. |

## Candidate 3 — SonarQube F1 (`symmetric.ts:59`, implicit Array.sort(), rule S2871)

| Field | Value |
|---|---|
| Source | Part 3.A, Critical Reliability bug |
| (a) Executed? | Yes — `crypto.test.ts` COND-36 (order-independence), every run |
| (b) Actual ≠ expected? | **No** — `derivePairwiseKey(A,B) === derivePairwiseKey(B,A)` holds every run; default string sort is UTF-16 code-unit order, deterministic and locale-independent for ASCII agent IDs |
| (c) Reproduced? | N/A — no failure to reproduce |
| (d) Already explained? | Investigated fresh for this triage: Sonar's suggested fix (`localeCompare`) would make ordering locale-dependent, which is worse for a canonicalization step feeding a hash |
| **Verdict** | **Not a defect.** True-positive static pattern, confirmed functionally correct for this specific usage on manual investigation. |

## Candidate 4 — SonarQube F4 (ambiguous JSX spacing, 12 occurrences, rule S6772)

| Field | Value |
|---|---|
| Source | Part 3.A, Major code smell pattern |
| (a) Executed? | Yes — visually inspected on every affected page during TC-01, TC-04, TC-10, TC-15, and the COND-51 walkthrough |
| (b) Actual ≠ expected? | **No** — every flagged label ("TTL", "port", "from", "to") renders with correct, readable spacing in the screenshots captured for those test cases |
| (c) Reproduced? | N/A — no rendering fault observed to reproduce |
| (d) Already explained? | N/A — genuinely checked, not explained away |
| **Verdict** | **Not a defect.** Static-analysis-only concern (linter cannot infer JSX whitespace intent); no observable rendering fault. |

---

## Summary

| Candidate | Status | Jira issue |
|---|---|---|
| TC-08 (COND-22) | FAILED (expected, environment) | [KAN-5](https://muhammadbilaltahir.atlassian.net/browse/KAN-5) — Done, Low, not a defect |
| TC-11 (COND-30) | BLOCKED (expected, precondition) | [KAN-6](https://muhammadbilaltahir.atlassian.net/browse/KAN-6) — Done, Low, not a defect |
| SonarQube F1 | Investigated | [KAN-7](https://muhammadbilaltahir.atlassian.net/browse/KAN-7) — Done, Low, not a defect |
| SonarQube F4 | Investigated | [KAN-8](https://muhammadbilaltahir.atlassian.net/browse/KAN-8) — Done, Low, not a defect |

**0 of 4 investigated candidates met all four defect criteria — so 0 open Bugs.** All four are
logged in Jira project **KAN** (Vexa Testing) as closed, fully-evidenced investigation records
under Epic [KAN-9](https://muhammadbilaltahir.atlassian.net/browse/KAN-9) — "SE3002 Assignment 01
— Defect Triage (Part 4)". Each carries environment/build, preconditions, numbered repro steps,
expected vs. actual result, reproducibility, severity/priority, the investigation writeup below,
verdict, related test-case ID, and a comment linking to the exact source evidence in this repo.
This file and the Jira issues are the same content in two places — this is the complete
defect-investigation evidence for Part 4.

**Visual evidence:** `evidence/jira/jira-kanban-board.png` is a live screenshot of the KAN board
(space "SQE AGENT MOM TESTING") showing all four issues in the Done column under Epic KAN-9;
`evidence/jira/jira-issues-detail.png` is a rendered detail view of all five issues (the Epic plus
the four Tasks), built from the raw API export `evidence/jira/jira-export.json`. The same board
screenshot is also embedded as Figure 1 in `docs/SQE_ASSIGNMENT1_Report_v2.docx`.

Supplementary evidence for the two designed genuine failures: `evidence/test-execution/`
(`npm-test-output-verbose.txt`, `TC-11-single-host-network-interfaces.txt`, and the manual-case
screenshots referenced in `docs/PART-3B-4.md`).
