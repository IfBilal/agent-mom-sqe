# Part 3.B — Functional Test Derivation, Execution and Traceability
# Part 4 — Defect Reporting and Final Quality Judgment

**Paste-ready content for `docs/SQE_ASSIGNMENT1_Report_v2.docx`**, under the existing "B. Functional
Test Derivation, Execution and Traceability" and "Part 4" placeholders. Column headers match the
assignment brief verbatim. All 15 test cases were executed against the frozen baseline, commit
`e79b197` (`evidence/BASELINE_TAG_HASH.txt`) — no file under `packages/` was changed to produce
this evidence. Full raw evidence: `evidence/test-execution/` (screenshots + full test-run logs).

---

## B. Functional Test Derivation, Execution and Traceability

### Table A — Test Condition Record

Conditions derived from all 7 FRs are in `TEST-CONDITIONS.md` (54 total). The 24 rows below back
the 15 executed test cases (Table B); the complete set is attached as `TEST-CONDITIONS.md`.

| Test basis / requirement | Condition ID | Test condition |
|---|---|---|
| 3.2.1.1/.2 | COND-04 | A send establishes a connection and the addressed agent receives the envelope |
| BR-01 | COND-05 | An envelope whose `recipientId` ≠ this agent is dropped and raises `PROTOCOL_VIOLATION` |
| 3.2.1.3 | COND-06 | A message sent A→B is not received by C |
| 3.2.1.4 | COND-07 | 50 messages sent A→B arrive in the order sent |
| BR-03 | COND-08 | A `sequenceNumber` of `lastSeen + 2` raises `SEQUENCE_ANOMALY`; `lastSeen + 1` does not |
| SRS UC2 | COND-10 | Use Case 2 (unicast) re-enacted end-to-end through the harness |
| 3.2.2.3 | COND-11 | `join()` transitions `NOT_MEMBER` → `JOINING` → `MEMBER` |
| BR-06 | COND-13 | `leave()` removes from the membership set before calling `dropMembership` |
| 3.2.2.9 / BR-07 | COND-16 | An agent joined to α and β receives from both, each attributed to the correct group |
| SRS UC1 | COND-17 | Use Case 1 (join/leave) re-enacted through the harness |
| BR-06 | COND-18 | A message inbound in the same event-loop tick as `leave()` is dropped, not delivered |
| BR-09 | COND-19 | `ttl = 1` is deliverable; `ttl = 0` is expired — exact boundary |
| BR-09 | COND-21 | A received envelope with expired TTL raises `MESSAGE_DROPPED_TTL_EXPIRED` and is not delivered |
| SRS §1.3 | COND-22 | OS-level `setMulticastTTL(0)` confines a datagram to the originating host |
| BR-10 | COND-24 | A destination outside `224.0.0.0/4` is rejected at send time |
| 3.2.3.1/.2 | COND-29 | A broadcast send is received by every agent on the same host |
| 3.2.3.3 | COND-30 | A broadcast is **sent to** all possible hosts under the same local network |
| SRS UC4 | COND-33 | Use Case 4 (broadcast) re-enacted through the harness |
| BR-16 | COND-37 | `encrypted = true` with `iv` or `authTag` missing is malformed: dropped, no decryption attempted |
| BR-14 | COND-38 | A message sent with `encrypted = false` travels as plaintext; the same body with `encrypted = true` differs on the wire |
| 3.2.4.4 | COND-39 | The receiver decrypts automatically with no user action |
| BR-18 | COND-42 | A non-allow-listed agent's key request is denied and raises `GROUP_KEY_DENIED` |
| 3.2.5.1/.2 | COND-47 | Delivery behaviour is identical before and after a live architecture switch |
| 3.2.5.1/.2 | COND-49 | The switch is observable in the harness with an `ARCHITECTURE_SWITCHED` marker |

### Table B — Test Case Record

All 15 cases executed on 2026-09-07 against the frozen baseline (`e79b197`), single-host test bed
(hostname `dns-HP-EliteBook-640-14-inch-G10-Notebook-PC`; `scripts/verify-preconditions.sh` output
in `evidence/test-execution/TC-11-single-host-network-interfaces.txt`). Automated cases: `npm test`,
full log in `evidence/test-execution/npm-test-output-verbose.txt`, all 217 automated tests green.
Manual cases: driven live through the harness (`bash runsystem.sh`, http://localhost:5173),
screenshots in `evidence/test-execution/`.

**Category minimums met:** boundary — TC-03, TC-05, TC-07 (3, ≥2 required). Invalid/error — TC-09,
TC-12, TC-14 (3, ≥2 required). Manual system-level — TC-01, TC-04, TC-10, TC-11, TC-15 (5, ≥3
required). Genuine FAILED/BLOCKED — TC-08 (FAILED), TC-11 (BLOCKED) (2, ≥2 required).

---

**TC-01 — Unicast delivery, SRS Use Case 2**
- Level/category: System — manual, Normal
- Test basis/objective: COND-10 (SRS UC2) + COND-04 (3.2.1.1/.2) — a unicast send is established and delivered to the addressed agent
- Preconditions: demo topology running (agent-A…D forked, control plane up)
- Test data: 3 messages, agent-A → agent-B, plaintext
- Steps: open Unicast page; from=agent-A, to=agent-B; send 3 messages in succession; observe status badge and log after each
- Expected result: each send is received by agent-B, in the order sent (3.2.1.4 applies transitively)
- Actual result: all 3 delivered; log timestamps strictly increasing (SENT then RECEIVED within 3ms, each pair before the next SENT) — `1788798965037/40`, `…72214/214`, `…76910/910`
- Status: **PASSED**
- Evidence: `TC-01-unicast-burst-success.png`; API log excerpt above

---

**TC-02 — Unicast addressing isolation**
- Level/category: Integration — automated, Business rule
- Test basis/objective: COND-06 (3.2.1.3) + COND-05 (BR-01) — a message addressed to B must not be observed by C
- Preconditions: demo topology forked in-test (`fr1-unicast.test.ts`)
- Test data: one message, agent-A → agent-B
- Steps: POST `/messages/unicast` A→B; query the aggregated log; assert every `MESSAGE_RECEIVED` for this exchange is attributed to agent-B only
- Expected result: no `MESSAGE_RECEIVED` event attributed to agent-C
- Actual result: matched — only agent-B logged as receiver
- Status: **PASSED**
- Evidence: `fr1-unicast.test.ts > TC-02 / COND-06 … > only B receives` — `npm-test-output-verbose.txt`

---

**TC-03 — Ordered delivery of a 50-message burst**
- Level/category: Integration — automated, **Boundary**
- Test basis/objective: COND-07 (3.2.1.4) + COND-08 (BR-03) — TCP-backed ordering holds under volume; no false `SEQUENCE_ANOMALY`
- Preconditions: as TC-02
- Test data: 50 sequential messages, agent-A → agent-B
- Steps: POST 50 messages in a loop; assert zero `SEQUENCE_ANOMALY` events; assert ≥50 `MESSAGE_SENT` from agent-A
- Expected result: no anomaly raised; all 50 sent
- Actual result: matched
- Status: **PASSED**
- Evidence: `fr1-unicast.test.ts > TC-03 / COND-07 … > ordered delivery` — `npm-test-output-verbose.txt`

---

**TC-04 — Multicast join/leave, SRS Use Case 1**
- Level/category: System — manual, Normal
- Test basis/objective: COND-17 (SRS UC1) + COND-11 (3.2.2.3) — join transitions membership and unlocks delivery; leave revokes it
- Preconditions: agent-A starts `NOT_MEMBER` of group α (`239.1.1.5`)
- Test data: group α, sender agent-C
- Steps: (1) confirm agent-A is `NOT_MEMBER`; (2) click join for agent-A; (3) send a multicast from agent-C; (4) confirm agent-A receives it; (5) click leave for agent-A; (6) send again from agent-C; (7) confirm agent-A does not receive it
- Expected result: agent-A receives only while a member (3.2.2.5, 3.2.2.6)
- Actual result: before join — agent-A absent from receivers of the pre-join send (see TC-14/06 area); after join — envelope `4c3289fb…` received by A, B, C, D; after leave — envelope `9327f9fa…` received by B, C, D only, **agent-A absent**
- Status: **PASSED**
- Evidence: `TC-04-multicast-joined.png`, `TC-04-multicast-received-after-join.png`, `TC-04-multicast-not-received-after-leave.png`

---

**TC-05 — Leave/inject race (BR-06 boundary)**
- Level/category: Integration — automated, **Boundary**
- Test basis/objective: COND-18 (BR-06) + COND-13 — a datagram inbound in the same event-loop tick as `leave()` must be dropped, not delivered, because the membership set is cleared synchronously *before* the OS `dropMembership` call
- Preconditions: agent-B is a member of α
- Test data: agent-B leaves α while agent-C injects a multicast in the same tick
- Steps: POST `/groups/239.1.1.5/leave-then-inject` with agentId=agent-B, injectFrom=agent-C; inspect the log for `MESSAGE_RECEIVED` attributed to agent-B
- Expected result: zero `MESSAGE_RECEIVED` for agent-B on that envelope
- Actual result: matched — zero
- Status: **PASSED**
- Evidence: `fr2-6-7.test.ts > TC-05 / COND-18 … > leave-then-inject drops the in-flight datagram` — `npm-test-output-verbose.txt`

---

**TC-06 — Multi-group attribution**
- Level/category: Integration — automated, Normal
- Test basis/objective: COND-16 (3.2.2.9 / BR-07) — an agent in two groups attributes each datagram to the correct group
- Preconditions: agent-C joined to both α and β
- Test data: one send to α, one to β
- Steps: send a multicast to α, then to β; inspect agent-C's received-events groupAddress field for each
- Expected result: α-send attributed to `239.1.1.5`, β-send to `239.1.1.6`, no cross-attribution
- Actual result: matched
- Status: **PASSED**
- Evidence: `fr2-fr3-delivery.test.ts > COND-26 / TC-06 area …` — `npm-test-output-verbose.txt`

---

**TC-07 — TTL expiry boundary**
- Level/category: Integration — automated, **Boundary**
- Test basis/objective: COND-19 (BR-09, exact boundary `ttl=1` vs `ttl=0`) + COND-21 — an expired-TTL envelope is dropped at the application layer
- Preconditions: none beyond demo topology
- Test data: multicast with `ttl=0`
- Steps: POST a multicast with ttl=0; inspect the log for `MESSAGE_DROPPED_TTL_EXPIRED`
- Expected result: envelope dropped, event raised, no `MESSAGE_RECEIVED` for it
- Actual result: matched
- Status: **PASSED**
- Evidence: `fr3-ttl.test.ts > TC-07 / COND-21 … > ttl=0 at the application layer is dropped` — `npm-test-output-verbose.txt`

---

**TC-08 — OS-level TTL confinement (SRS §1.3) — deliberately expected FAILED**
- Level/category: Integration — automated, Normal
- Test basis/objective: COND-22 — SRS §1.3 defines TTL as router hops; `setMulticastTTL(0)` should confine a datagram to the originating host
- Preconditions: single-host test bed (no router in the path)
- Test data: multicast with a positive envelope TTL (so only the level-1 OS TTL could confine it)
- Steps: send a group-α multicast; record which co-located agents receive it
- Expected result (per SRS §1.3): the datagram does not leave the originating host
- Actual result: agent-C, agent-B, and agent-D **all** received it — same-host delivery traverses no router, so hop-count confinement has nothing to act on
- Status: **FAILED** (against the SRS expectation; the assertion in the test file verifies this actual outcome, so Vitest itself reports the test file as passing — see §5.1 below for the distinction)
- Evidence: `fr3-ttl.test.ts > TC-08 / COND-22 …` console line: `[TC-08] co-located receivers observed for a group-α multicast: agent-C, agent-B, agent-D` — `npm-test-output-verbose.txt`

---

**TC-09 — Multicast address range validation**
- Level/category: Integration — automated, **Invalid/error**
- Test basis/objective: COND-24 (BR-10) — a destination outside `224.0.0.0/4` is rejected at send time
- Preconditions: none
- Test data: groupAddress `10.0.0.1`
- Steps: POST `/messages/multicast` with groupAddress=10.0.0.1
- Expected result: rejected, HTTP 400
- Actual result: matched
- Status: **PASSED**
- Evidence: `fr3-ttl.test.ts > TC-09 / COND-24 … > the control plane returns an error for 10.0.0.1` — `npm-test-output-verbose.txt`

---

**TC-10 — Broadcast delivery, SRS Use Case 4 (host-local)**
- Level/category: System — manual, Normal
- Test basis/objective: COND-29 (3.2.3.1/.2) + COND-33 (SRS UC4) — one broadcast datagram is *sent to* every host reachable, observed here as every agent on this host
- Preconditions: demo topology running
- Test data: one broadcast from agent-A
- Steps: open Broadcast page; from=agent-A; send; observe per-agent receipt indicators and `addressUsed`
- Expected result: all 4 agents show received; `addressUsed` reported
- Actual result: agent-A, B, C, D all show "✓ received"; `addressUsed = 255.255.255.255`
- Status: **PASSED**
- Evidence: `TC-10-broadcast-hostlocal-received.png`

---

**TC-11 — LAN-wide broadcast reach, SRS 3.2.3.3 — BLOCKED**
- Level/category: System — manual, Normal
- Test basis/objective: COND-30 — a broadcast must be *sent to* "all possible hosts under the same local network"
- Preconditions required: a multi-host local network so "all possible hosts" can be enumerated and receipt confirmed on each
- Preconditions actually available: **one physical machine** (`dns-HP-EliteBook-640-14-inch-G10-Notebook-PC`), confirmed by `scripts/verify-preconditions.sh` — 5 network interfaces on this one host, zero additional hosts reachable to test against
- Test data: same broadcast as TC-10
- Steps: attempt to confirm receipt on a second host on the LAN
- Expected result: N/A — the precondition itself cannot be established
- Actual result: **the required precondition (≥2 hosts on the same local network) does not exist on this test bed.** This is not a claim that LAN-wide delivery failed — it was never executed at LAN scope. TC-10 already establishes host-local delivery (which does work); TC-11 is strictly about LAN-scale reach.
- Status: **BLOCKED**
- Evidence: `TC-11-single-host-network-interfaces.txt` (`verify-preconditions.sh` output, one host, 5 interfaces, no peer)

---

**TC-12 — Malformed encrypted envelope**
- Level/category: Unit — automated, **Invalid/error**
- Test basis/objective: COND-37 (BR-16) — `encrypted=true` with `iv`/`authTag` missing must be dropped, with no decryption attempt
- Preconditions: none
- Test data: envelope with `encrypted:true`, `iv` present, `authTag` absent (and the false/stray-fields inverse)
- Steps: call `validateEnvelope` on the malformed envelope
- Expected result: `MALFORMED_CRYPTO_FIELDS` (or `STRAY_CRYPTO_FIELDS` for the inverse case), decryption never attempted
- Actual result: matched, all 3 branches (missing authTag, stray iv, ttl-on-non-multicast)
- Status: **PASSED**
- Evidence: `validator-and-sequence.test.ts > §8 invariants — BR-16 malformed crypto fields (TC-12 target)` — `npm-test-output-verbose.txt`

---

**TC-13 — Per-message encryption opt-in + auto-decrypt**
- Level/category: Integration — automated, Business rule
- Test basis/objective: COND-38 (BR-14) + COND-39 (3.2.4.4) — encryption is a per-message sender choice; the receiver decrypts automatically
- Preconditions: none
- Test data: one unicast with `encrypted:true`
- Steps: POST an encrypted unicast A→B; confirm receipt with no `DECRYPTION_FAILED`
- Expected result: delivered, `encrypted:true` on the wire, auto-decrypted, no user action, no failure event
- Actual result: matched
- Status: **PASSED**
- Evidence: `fr1-unicast.test.ts > TC-13 / COND-38+39 …` — `npm-test-output-verbose.txt`; also demonstrated live: `TC-01-unicast-burst-success.png` (encrypted send shown in the harness)

---

**TC-14 — Key-request denial for a non-allow-listed agent**
- Level/category: Integration — automated, **Invalid/error**
- Test basis/objective: COND-42 (BR-18) — the key holder must deny a request from an agent not on its allow-list
- Preconditions: agent-B is a member of α but is **not** on agent-D's allow-list (allow-list ≠ membership, by design)
- Test data: key request from agent-B for group α
- Steps: POST `/keys/request` with requestingAgentId=agent-B; inspect for `GROUP_KEY_DENIED`
- Expected result: denied
- Actual result: matched; the allow-listed control case (agent-C) is granted in the same run, confirming the gate discriminates correctly
- Status: **PASSED**
- Evidence: `fr2-6-7.test.ts > TC-14 / COND-42 …` — `npm-test-output-verbose.txt`

---

**TC-15 — Live conversation-architecture switch**
- Level/category: System — manual, Normal
- Test basis/objective: COND-47 (3.2.5.1/.2, identical delivery either side of a switch) + COND-49 (the switch is observable with a marker)
- Preconditions: agent-A running agent-controlled
- Test data: 1 unicast A→B before the switch, 1 after
- Steps: (1) send a unicast A→B (agent-controlled, confirmed delivered — see TC-01); (2) switch agent-A to component-controlled on the Architecture page; (3) confirm `ARCHITECTURE_SWITCHED` logged; (4) send another unicast A→B; (5) confirm delivered
- Expected result: identical delivery both sides; marker present; no socket restart
- Actual result: pre-switch sends delivered (TC-01 evidence); `ARCHITECTURE_SWITCHED` logged for agent-A at `1788799138095`; post-switch send (envelope `c3b3b4c5…`) SENT then RECEIVED 1ms later, same as pre-switch timing
- Status: **PASSED**
- Evidence: `TC-15-architecture-switched.png`, `TC-15-delivery-after-switch.png`; automated confirmation `fr2-6-7.test.ts > TC-15 / COND-49 …` — `npm-test-output-verbose.txt`

---

### Table C — Traceability Record

Full 54-condition matrix. `TC-nn` = one of the 15 formal Table B cases above; other carriers are
automated unit/component/integration tests (all green — `npm-test-output-verbose.txt`), or a
manual observation folded into an adjacent Table B case (noted explicitly). No defect is entered
unless it survived the four-step investigation in §5 below.

| Requirement | Condition | Test case | Execution result | Defect report |
|---|---|---|---|---|
| FR1 — 3.2.1.1–.4 | COND-01…03 | `framing.test.ts` (unit) | PASSED | N/A |
| FR1 | COND-04 | `unicast-transport.test.ts` (component) | PASSED | N/A |
| FR1 | COND-05 | `unicast-transport.test.ts` (component) | PASSED | N/A |
| FR1 | COND-06 | **TC-02** | PASSED | N/A |
| FR1 | COND-07 | **TC-03** | PASSED | N/A |
| FR1 | COND-08 | `validator-and-sequence.test.ts` (unit) | PASSED | N/A |
| FR1 | COND-09 | `unicast-transport.test.ts` + `fr1-unicast.test.ts` | PASSED | N/A |
| FR1 | COND-10 | **TC-01** | PASSED | N/A |
| FR2 — 3.2.2.3–.6, .9 | COND-11…13 | `membership-and-multicast.test.ts` (component) | PASSED | N/A |
| FR2 | COND-14 | `fr2-6-7.test.ts` (integration) | PASSED | N/A |
| FR2 | COND-15 | `fr2-fr3-delivery.test.ts` (integration) | PASSED | N/A |
| FR2 | COND-16 | **TC-06** | PASSED | N/A |
| FR2 | COND-17 | **TC-04** | PASSED | N/A |
| FR2 | COND-18 | **TC-05** | PASSED | N/A |
| FR3 — 3.2.2.1, .2, .7, .8 | COND-19, 25 | `framing.test.ts` (unit) | PASSED | N/A |
| FR3 | COND-20 | `membership-and-multicast.test.ts` (component) | PASSED | N/A |
| FR3 | COND-21 | **TC-07** | PASSED | N/A |
| FR3 | COND-22 | **TC-08** | **FAILED (expected — environment limitation)** | N/A — see §5.2 |
| FR3 | COND-23 | `security-and-config.test.ts` (component) | PASSED | N/A |
| FR3 | COND-24 | **TC-09** | PASSED | N/A |
| FR3 | COND-26 | `fr2-fr3-delivery.test.ts` (integration) | PASSED | N/A |
| FR3 | COND-27 | observed during TC-04's multicast send/receive walkthrough | PASSED (observed) | N/A |
| FR4 — 3.2.3.1–.3 | COND-28, 31, 32 | `broadcast-keyholder-misc.test.ts` (component) | PASSED | N/A |
| FR4 | COND-29 | **TC-10** | PASSED | N/A |
| FR4 | COND-30 | **TC-11** | **BLOCKED (single-host precondition unmet)** | N/A — see §5.2 |
| FR4 | COND-33 | folded into **TC-10** (UC4 walkthrough) | PASSED | N/A |
| FR5 — 3.2.4.1–.4 | COND-34, 35, 36, 54 | `crypto.test.ts` (unit) | PASSED | N/A |
| FR5 | COND-37 | **TC-12** | PASSED | N/A |
| FR5 | COND-38, 39 | **TC-13** | PASSED | N/A |
| FR5 | COND-40 | `crypto.test.ts` + `security-and-config.test.ts` | PASSED | N/A |
| FR6 — 3.2.4.5, .6 | COND-41, 42 | **TC-14** | PASSED | N/A |
| FR6 | COND-43, 44, 45 | `fr5-fr6-security.test.ts` (integration) | PASSED | N/A |
| FR7 — 3.2.5.1, .2 | COND-46 | `broadcast-keyholder-misc.test.ts` (component) | PASSED | N/A |
| FR7 | COND-47, 48 | `fr7-architecture.test.ts` (integration) | PASSED | N/A |
| FR7 | COND-49 | **TC-15** | PASSED | N/A |
| NFR8 — 3.2.6.1 | COND-50 | `broadcast-keyholder-misc.test.ts` (component) | PASSED | N/A |
| NFR8 | COND-51 | manual — Compatibility page, live | PASSED | N/A |
| NFR9 — 2.4.1 | COND-52 | `traceability.test.ts` (static inspection) | PASSED | N/A |
| NFR9 | COND-53 | `fr2-fr3-delivery.test.ts` (integration) | PASSED | N/A |
| NFR10 — 2.4.2 | COND-54 | `crypto.test.ts` + `fr5-fr6-security.test.ts` | PASSED | N/A |

**52 of 54 conditions PASSED. 1 FAILED (COND-22/TC-08, deliberate, environment-caused). 1 BLOCKED
(COND-30/TC-11, deliberate, precondition-caused). Zero conditions produced a confirmed
implementation defect** — see the investigation in Part 4 below.

---

## Part 4 — Defect Reporting and Final Quality Judgment

### 5.1 The FAILED/BLOCKED-vs-defect distinction, applied to TC-08

Vitest's own report shows `fr3-ttl.test.ts` **passing** — because the test's assertion is about
the *observation itself* ("record which agents received the confinement-violating datagram"), not
about confinement occurring. The SRS-level verdict is separate: judged against SRS §1.3's own
definition of TTL (router hops before discard), the confinement **did not occur**, so **TC-08 is
FAILED against the SRS expected result**, independent of what the test runner's exit code says.
This is exactly the distinction the assignment's own worked example draws between a green CI run
and a genuine SRS-level test verdict.

### 5.2 Investigation of every FAILED/BLOCKED case (assignment's required process)

**TC-08 — FAILED.**
- Test setup/data/environment checked: single physical machine, no router in the network path.
- Reproduced: yes, deterministically, every run (`npm test` reruns this and gets the same result
  each time — 3/3 observed in this session alone, plus every prior CI run recorded in git history).
- Root cause: SRS §1.3 defines TTL as a router-hop counter. `setMulticastTTL(0)` is enforced by
  the kernel's IP stack when a packet crosses a router; on loopback/same-host delivery, no router
  is traversed, so the mechanism the SRS describes has nothing to act on. The implementation calls
  `socket.setMulticastTTL()` correctly (verified by code inspection, `multicast-transport.ts`) —
  the OS behaves as documented for same-host delivery, and the SRS's own test bed for this
  behaviour requires a router the assignment's environment does not provide.
- Verdict: **not a defect.** This is declared in advance in `DEVIATIONS.md` D-5 and
  `evidence/PHASE-10-VERIFICATION.md` as an environment limitation, not discovered after the fact
  to explain away a failure — the implementation matches the SRS; the test bed cannot exercise the
  SRS's router-hop scope.

**TC-11 — BLOCKED.**
- Precondition checked: `scripts/verify-preconditions.sh` confirms exactly one host, no peer
  reachable on the local network.
- Reproduced: not applicable — a BLOCKED case is one that cannot execute, not one that executes
  and fails; there is nothing to reproduce.
- Root cause: the required precondition ("all possible hosts under the same local network" as an
  enumerable, testable set) does not exist on a single development machine.
- Verdict: **not a defect.** Declared in advance in `ASSUMPTIONS.md` A4.1/A4.2. TC-10 already
  confirms the send/receive logic itself is correct at the scale this test bed can exercise
  (host-local); TC-11 is strictly a claim about network-wide reach that was never executable here.

**F1 (SonarQube, Part 3.A) — `symmetric.ts:59` implicit `Array.sort()`.**
- Checked whether the sort output feeds a hash, as flagged as a risk in Part 3.A: **yes** —
  `derivePairwiseKey()` sorts `[agentA, agentB]`, joins them, and hashes the result.
- Investigated what "implicit sort" means for an array of ASCII agent-ID strings: JavaScript's
  default comparator without an explicit function sorts strings by UTF-16 code-unit order, which
  is deterministic and does not depend on locale, ICU version, or host configuration. This is
  confirmed by `crypto.test.ts`'s COND-36 (`derivePairwiseKey(A,B) === derivePairwiseKey(B,A)`,
  which passes on every run).
- Reproduced the *concern*, not a failure: repeated runs of `security-modules.test.ts` and
  `crypto.test.ts` across this session show `derivePairwiseKey` producing an identical, correctly
  order-independent key every time — the actual result matches the expected result (order
  independence), so criterion (b) of the defect rule of thumb is not met.
- Note on SonarQube's suggested fix: adding `.sort((a, b) => a.localeCompare(b))`, as rule S2871
  recommends, would make the ordering **locale-dependent** — the opposite of what a
  canonicalization step for a cryptographic key needs. Applying Sonar's own suggestion here would
  introduce the exact class of bug the rule exists to prevent.
- Verdict: **not a defect.** A true-positive static finding (the pattern S2871 flags is real) that,
  on manual investigation of this specific usage, is not a functional defect and should not be
  "fixed" per Sonar's generic suggestion.

**F4 (SonarQube, Part 3.A) — ambiguous JSX spacing, 12 occurrences across the harness.**
- Checked whether the flagged label/input pairs render with the space that Sonar cannot confirm
  is intentional (e.g. "TTL 5" vs "TTL5").
- Manually inspected the rendered harness on every affected page during TC-01, TC-04, TC-10,
  TC-15, and the COND-51 walkthrough (`TC-04-multicast-joined.png`,
  `TC-10-broadcast-hostlocal-received.png`, `COND-51-legacy-compat-success.png`, and others):
  every flagged label ("TTL", "port", "from", "to") renders with a clear, correctly spaced value
  next to it.
- Actual result matches expected result (readable, correctly spaced labels) — criterion (b) of the
  defect rule of thumb is not met.
- Verdict: **not a defect.** A genuine static-analysis flag (the JSX source is ambiguous to a
  linter) with no observable, reproducible rendering failure. Left as a documented code-style item,
  not escalated.

### 5.3 Jira

**Outcome of triage: zero confirmed, reproducible implementation defects.** Every FAILED/BLOCKED
test case and every SonarQube finding investigated for defect potential (F1, F4 — the two with any
plausible functional angle; F2, F3, F5 are accessibility/style items with no test-derived defect
claim to investigate) resolved to "not a defect" for a specific, evidenced reason, per §5.2.

Per the assignment's own wording — *"not every failure or blocker should become a Jira bug"* —
**none of the four investigated candidates was logged as an open Bug**, because none satisfies all
four defect criteria (executed test; actual ≠ expected; reproduced ≥2 times; not explained by an
already-declared assumption/limitation). Instead, each is logged in Jira as a **closed,
fully-documented investigation record**, so the audit trail exists in the tool the assignment
requires, not only in this report.

**Jira project:** Vexa Testing (`KAN`),
https://muhammadbilaltahir.atlassian.net/jira/software/projects/KAN. Epic **KAN-9** — "SE3002
Assignment 01 — Defect Triage (Part 4)" — groups four Task-type issues (this project defines no
Bug issue type), each `Done` / `Low` priority, each carrying environment/build, preconditions,
numbered reproduction steps, expected vs. actual result, reproducibility, severity/priority, the
full investigation writeup, verdict, related test-case ID, and a comment linking to the exact
source evidence in the repository:

| Candidate | Jira issue |
|---|---|
| TC-08 / COND-22 (setMulticastTTL(0) confinement) | [KAN-5](https://muhammadbilaltahir.atlassian.net/browse/KAN-5) |
| TC-11 / COND-30 (LAN-wide broadcast reach) | [KAN-6](https://muhammadbilaltahir.atlassian.net/browse/KAN-6) |
| SonarQube F1 (crypto sort) | [KAN-7](https://muhammadbilaltahir.atlassian.net/browse/KAN-7) |
| SonarQube F4 (JSX spacing) | [KAN-8](https://muhammadbilaltahir.atlassian.net/browse/KAN-8) |

**Evidence export:** `evidence/jira/DEFECT-TRIAGE.md` mirrors the same investigation content for
reviewers without Jira access; `evidence/jira/jira-export.json` and
`evidence/jira/jira-issues-detail.png` are the raw API export and a rendered detail view of all
five issues, pulled via the Jira REST API against the live project.

### 5.4 Final Quality Judgment (350 words)

The combined evidence supports a working implementation of the ten selected requirements. All 217
automated tests pass (unit/component/integration, ~99.7% line coverage), SonarQube's Quality Gate
passed against the complete frozen codebase (Reliability D driven almost entirely by one justified
finding and a JSX-spacing pattern confirmed cosmetic; Security effectively clean once the single
repeated multicast-address pattern is discounted), and all 15 designed test cases executed with
every required category met — including two genuine, investigated FAILED/BLOCKED results that were
neither manufactured nor hidden.

What remains unsupported is scoped and specific, not general doubt. NFR8 (1.2 compatibility) cannot
be validated against a real agentMom 1.2 artifact — none exists to compare against, and the
implementation runs on Node rather than the SRS-specified Java 1.4, so the compatibility check is
against a self-authored reconstruction (A8.2) by construction, not a limitation testing can close.
NFR9's "all or none" delivery wording admits no falsifiable pass/fail rate. NFR10 explicitly
disclaims any decryption-resistance guarantee, so nothing was promised to test against there either.
Three further assumptions — deterministic pairwise unicast keys with no handshake (A5.2), no group-
key rotation on leave (A6.2), and the limited-broadcast address choice (A4.1) — are declared
design-time stand-ins, not SRS-derived guarantees.

AI-introduced assumptions materially shaped where confidence can and cannot be placed. A5.2 in
particular is a real security-relevant design gap — a deterministic, handshake-free key — that
neither SonarQube (which flagged the sort, not the absence of a handshake) nor functional testing
(which only confirms the derivation is *consistent*, not that it is *secure*) can detect, because it
is a protocol-design choice rather than a code-level defect. This is a boundary functional testing
cannot cross by design.

Scoped strictly to the ten requirements evaluated, on this single-host test bed, against this
frozen baseline: the implementation is **acceptable**. FR1–FR7 are supported by executed,
reproducible evidence at every category the assignment requires. NFR8–NFR10 are evaluated as far as
their own wording permits, with every remaining gap named rather than glossed. This is not a claim
about production readiness, real agentMom-1.2 interoperability, or LAN-scale broadcast — those
remain explicitly out of evidence, not silently assumed.
