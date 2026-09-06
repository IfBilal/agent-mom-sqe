# Phase 10 — Pre-freeze verification

Date: 2026-09-06 (revised after the hardening pass)

| Check (plan §10 / §20) | Status |
|---|---|
| `packages/core` compiles; `npm run build` green for core/agent/control-plane | ✅ |
| All U/C/I suites green | ✅ **83 tests, 16 files** |
| Coverage report generated, non-zero per package | ✅ core ~100% on pure modules; agent + control-plane non-zero; `coverage/lcov.info` emitted; overall 82% lines; agent.ts 81% |
| `ASSUMPTIONS.md` matches §4 — 24 entries, each file-linked, one of three labels | ✅ 24 |
| `TEST-CONDITIONS.md` matches §13 — 54 entries | ✅ 54 |
| Every §4 assumption has a findable comment in its named file | ✅ all 24 verified by `grep -rl "\bA<n>\b" packages/*/src` |
| **Every non-system COND-nn traced to a Table B case or automated test** | ✅ enforced by `core/tests/unit/traceability.test.ts` — zero orphans; see `TRACEABILITY.md` |
| COND-52 static inspection (no ack/retry/resend on transports) | ✅ meta-test greps transport source, passes |
| Re-enact SRS Figures 1–4 in the harness | ✅ driven live via Playwright — FR1–FR7 + BR-13 handled denial + BR-19 encrypted key exchange all confirmed in-browser |
| `README.md` documents node version, install, `npm run dev-up`, demo spawn | ✅ |
| Orderly shutdown leaves no orphan agents | ✅ control-plane handles SIGINT/SIGTERM/SIGHUP → `supervisor.shutdown()`; agent exits on IPC `disconnect` |
| Nothing outside §1 built (checked against §21 non-goals) | ✅ no DB, no auth, no retry/ack layer, no resequencing buffer, no Docker/k8s, no workaround for COND-22 |

## Known limitations carried into the baseline (declared, not hidden)

1. **Runtime deviation (CON-09 / A8.2).** TypeScript, not Java 1.4.0. NFR8 is
   evaluated against a self-authored contract and cannot validate real
   compatibility.
2. **Single-host test bed (CON-04 / CON-05).** LAN-scale multicast/broadcast
   scope is not verifiable → TC-11 BLOCKED, TC-08 expected FAILED. Not defects.
3. **Forked-child coverage.** `packages/agent/src/main.ts` runs only in forked
   children; v8 coverage does not instrument them, so its lines read low despite
   being exercised by the integration suites (plan §12.4). Disclosed in README.
4. **Loopback multicast.** `setMulticastInterface('127.0.0.1')` + loopback on;
   delivery observed working on the dev host but is environment-dependent.

## Held for post-freeze (plan §22 — NOT part of the builder's remit)

- Phase 12 SonarQube scan of the frozen tree → `evidence/sonarqube/`
- Phase 13 execution of the 15 Table B cases (5 manual system-level) → `evidence/test-execution/`
- Phase 14 defect triage (§18.1) and 300–400 word final judgment → `evidence/jira/`

`sonar-project.properties` and `scripts/verify-preconditions.sh` are in place for these.
