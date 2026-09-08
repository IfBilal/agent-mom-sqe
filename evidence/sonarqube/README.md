# SonarQube Evidence — agentMom SE3002 Baseline

- Project key: `agentmom-se3002`
- Scanned commit: `baseline-v1-sonar` tag → `72aedfb8781e4304a88c0f01f2af3df5e7e5661b` (HEAD at scan time; frozen app code is `e79b197`, per `evidence/BASELINE_TAG_HASH.txt`)
- Scanner: sonar-scanner CLI 6.2.1.4610, SonarQube Community Build 26.9.0.129388 (local Docker, `sonarqube:community`)
- Analysis task status: SUCCESS, executed 2026-09-07T11:03:43Z, duration 9.8s
- Scope: `sonar-project.properties` at repo root — all 4 workspace packages' `src` and `tests`, no file-level exclusions beyond `node_modules`, `dist`, `*.d.ts`

## Files in this folder
- `sonar-measures.json` — summary metrics (LOC, ratings, coverage, duplications, Quality Gate)
- `sonar-issues-full.json` — complete raw export of all 71 issues (`api/issues/search`)
- `sonar-hotspots.json` — Security Hotspots export (0 returned)

## Headline results
- Quality Gate: Passed
- Lines of Code: 3.3k
- Security rating: A (`security_rating` = 1.0, 0 open vulnerabilities, 0 security hotspots — see `sonar-measures.json`). 19 Security-domain issues exist, but all are `CODE_SMELL`-type (rule S1313, one pattern: hardcoded multicast IP 239.1.1.5/239.1.1.6), not `VULNERABILITY`-type, so they do not depress the rating.
- Reliability rating: D (14 issues — 1 Critical bug, 1 Major bug, 12 JSX-spacing code smells)
- Maintainability rating: A (50 issues)
- Coverage: 88.8%
- Duplications: 0.0%
- Security Hotspots: 0
