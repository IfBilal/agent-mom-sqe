# FEATURE-MAP.md — every feature → requirement → code → test

The plan locks the scope to **7 FRs + 3 NFRs** (plan §1). Nothing else is built
(enforced by `packages/core/tests/unit/dod.test.ts` §20.9). This table maps every
shipped capability to the requirement it serves, the module that implements it,
the business rules it enforces, and the tests that cover it.

Legend for test level: **U** unit · **C** component · **I** integration · **S** system (manual).

---

## FR1 — Unicast (SRS 3.2.1.1–.4)

*Send/receive unicast; received only by the specified address; arrives in order.*

| Feature | Module | Rules | Tests |
|---|---|---|---|
| Length-prefixed TCP framing; partial/coalesced `data` events reassembled | `core/protocol/unicast-framing.ts` | BR-02 | `framing.test.ts` (U: COND-01/02/03) |
| Persistent one-connection-per-ordered-pair TCP transport | `agent/transports/unicast-transport.ts` | BR-01, A1.1, A1.2 | `unicast-transport.test.ts` (C: COND-04), `agent-orchestration.test.ts` (C), `fr1-unicast.test.ts` (I: TC-02/03) |
| Recipient check — drop + `PROTOCOL_VIOLATION` on mismatch | `agent/transports/unicast-transport.ts` | BR-01 | `unicast-transport.test.ts` (C: COND-05), `agent-inbound-paths.test.ts` (C) |
| Sequence verification (observe only, never resequence) | `core/protocol/sequence-checker.ts` | BR-02, BR-03 | `validator-and-sequence.test.ts` (U: COND-08), `coverage-gaps.test.ts` (C: SEQUENCE_ANOMALY) |
| Connection error on a stopped peer — no crash | `agent/transports/unicast-transport.ts` | A1.2 | `unicast-transport.test.ts` (C: COND-09), `fr1-unicast.test.ts` (I) |
| Cross-agent isolation (A→B not seen by C) | end-to-end | 3.2.1.3 | `fr1-unicast.test.ts` (I: COND-06) |
| Ordered delivery of 50 messages | end-to-end | 3.2.1.4 | `fr1-unicast.test.ts` (I: COND-07) |
| Use Case 2, end-to-end through the harness | `web/pages/Unicast.tsx` | — | **S** — TC-01 (manual, Phase 13) |

## FR2 — Multicast membership (SRS 3.2.2.3–.6, 3.2.2.9)

*Join/leave a group; no delivery before join or after leave; multiple groups at once.*

| Feature | Module | Rules | Tests |
|---|---|---|---|
| Membership state machine `NOT_MEMBER → JOINING → MEMBER` | `agent/membership/group-membership-manager.ts` | BR-04, A2.1 | `membership-and-multicast.test.ts` (C: COND-11) |
| App-level membership set, independent of the OS join | `agent/membership/group-membership-manager.ts` | BR-04, BR-05 | `membership-and-multicast.test.ts` (C), `fr2-6-7.test.ts` (I: COND-14), `fr2-fr3-delivery.test.ts` (I: COND-15) |
| Synchronous leave *before* `dropMembership` (the BR-06 window) | `agent/membership/group-membership-manager.ts` | BR-06, A2.1 | `membership-and-multicast.test.ts` (C: COND-13), `fr2-6-7.test.ts` (I: TC-05/COND-18) |
| One socket per joined group → unambiguous attribution | `agent/transports/multicast-transport.ts` | BR-07, A2.2 | `fr2-fr3-delivery.test.ts` (I: COND-16 / TC-06) |
| Inbound classification (membership gate, group cross-check) | `agent/transports/multicast-inbound.ts` | BR-04, BR-05 | `multicast-inbound.test.ts` (U + C: all branches) |
| Use Case 1 (join/leave), end-to-end | `web/pages/Multicast.tsx` | — | **S** — TC-04 (manual, Phase 13) |

## FR3 — Multicast messaging + TTL (SRS 3.2.2.1, .2, .7, .8)

*Send/receive multicast; set TTL; set multicast address and port.*

| Feature | Module | Rules | Tests |
|---|---|---|---|
| UDP datagram framing (boundary-preserving), size cap | `core/protocol/multicast-framing.ts` | BR-11, A3.3 | `framing.test.ts` (U: COND-25), `protocol-and-validation-gaps.test.ts` (U) |
| Default TTL constant (flagged, non-SRS) | `core/constants.ts` | BR-08, A3.1 | `framing.test.ts` (U: COND-19) |
| TTL boundary predicate (`ttl <= 0` → expired) | `core/protocol/multicast-framing.ts` | BR-09 | `framing.test.ts` (U: COND-19) |
| Level-1 OS `setMulticastTTL` + level-2 receiver check (A3.2 divergence) | `agent/transports/multicast-transport.ts`, `multicast-inbound.ts` | BR-09, A3.2 | `multicast-inbound.test.ts` (C: COND-21 area), `fr3-ttl.test.ts` (I: COND-21) |
| Destination range check `224.0.0.0/4` at send | `agent/transports/multicast-transport.ts`, `core/validation/envelope-validator.ts` | BR-10 | `validator-and-sequence.test.ts` (U: COND-24), `membership-and-multicast.test.ts` (C), `fr3-ttl.test.ts` (I: TC-09) |
| Runtime group address / port reconfiguration | `agent/transports/multicast-transport.ts` + `groups` route | 3.2.2.8 | `security-and-config.test.ts` (C: COND-23), `rest-coverage.test.ts` (I) |
| **TC-08 — `setMulticastTTL(0)` confinement (executed, expected FAILED)** | — | SRS §1.3 | `fr3-ttl.test.ts` (I) — outcome recorded, **no workaround** |
| Use Case 3, end-to-end | `web/pages/Multicast.tsx` | — | **S** — TC-27 (manual, Phase 13) |

## FR4 — Broadcast (SRS 3.2.3.1–.3)

*Message **sent to** all possible hosts on the local network.*

| Feature | Module | Rules | Tests |
|---|---|---|---|
| `reuseAddr` + `setBroadcast(true)` shared-port socket | `agent/transports/broadcast-transport.ts` | BR-12 | `broadcast-keyholder-misc.test.ts` (C: COND-28) |
| Limited-broadcast send + subnet-directed fallback + `addressUsed` | `agent/transports/broadcast-transport.ts` | BR-12, A4.1 | `coverage-gaps.test.ts` (C), `broadcast-keyholder-misc.test.ts` (C: COND-32), `fr4-broadcast.test.ts` (I: COND-29) |
| `EACCES`/`EPERM` → `BROADCAST_PERMISSION_DENIED`, never a crash | `agent/transports/broadcast-transport.ts` | BR-13, 2.4.4 | `broadcast-keyholder-misc.test.ts` (C: COND-31) |
| Received-datagram handler + malformed guard | `agent/transports/broadcast-transport.ts` | — | `coverage-gaps.test.ts` (C) |
| **TC-11 — LAN-wide "all possible hosts" (BLOCKED — single host)** | — | 3.2.3.3 | **S** — recorded BLOCKED, Phase 13 |
| Use Case 4, end-to-end | `web/pages/Broadcast.tsx` | — | **S** — TC-10 (manual, Phase 13) |

## FR5 — Unicast security (SRS 3.2.4.1–.4)

*Encrypt/decrypt unicast; sender opts in per message; receiver decrypts automatically.*

| Feature | Module | Rules | Tests |
|---|---|---|---|
| AES-256-GCM authenticated encrypt/decrypt (pure) | `core/crypto/symmetric.ts` | A5.1, A10.1 | `crypto.test.ts` (U: COND-34/35), `protocol-and-validation-gaps.test.ts` (U) |
| Deterministic pairwise key derivation (order-independent) | `core/crypto/symmetric.ts` | A5.2 | `crypto.test.ts` (U: COND-36) |
| Per-message opt-in (composer toggle → `envelope.encrypted`) | `agent/security/unicast-security.ts` + `web` | BR-14 | `security-modules.test.ts` (C), `fr5-fr6-security.test.ts` (I: COND-38) |
| Auto-decrypt on receive, fail closed on bad key | `agent/security/unicast-security.ts` | BR-15, BR-17 | `security-modules.test.ts` (C: COND-40), `fr5-fr6-security.test.ts` (I: COND-39), `agent-inbound-paths.test.ts` (C: DECRYPTION_FAILED) |
| Malformed-envelope validation — drop, no decryption attempt | `core/validation/envelope-validator.ts` | BR-16, A5.3 | `validator-and-sequence.test.ts` + `protocol-and-validation-gaps.test.ts` (U: COND-37), `security-and-config.test.ts` (C), `agent-inbound-paths.test.ts` (C: MESSAGE_MALFORMED) |
| Ciphertext on the wire ≠ plaintext | `core/crypto/symmetric.ts` | 2.4.2 | `crypto.test.ts` (U: COND-54), `fr5-fr6-security.test.ts` (I: COND-54) |

## FR6 — Multicast security (SRS 3.2.4.5, .6)

*Encrypt/decrypt multicast with a group key from an allow-listing key holder.*

| Feature | Module | Rules | Tests |
|---|---|---|---|
| Key holder — per-group key, **allow-list ≠ membership**, grant/deny | `agent/key-holder/key-holder-agent.ts` | BR-18, A6.1 | `broadcast-keyholder-misc.test.ts` (C: COND-41/42), `coverage-gaps.test.ts` (C), `agent-orchestration.test.ts` (C) |
| Key request/response always encrypted (overrides opt-out) | `core/crypto/key-holder-protocol.ts` + `agent/agent.ts` | BR-19, A6.3 | `protocol-and-validation-gaps.test.ts` (U), `agent-orchestration.test.ts` (C), `fr5-fr6-security.test.ts` (I: COND-43) |
| Group-key encrypt/decrypt, fail closed for non-holders | `agent/security/multicast-security.ts` | BR-17 | `security-modules.test.ts` (C), `fr5-fr6-security.test.ts` (I: COND-44), `agent-inbound-paths.test.ts` (C) |
| **No key rotation on leave — a departed agent keeps the key** | `agent/key-holder/key-holder-agent.ts` | BR-20, A6.2 | `broadcast-keyholder-misc.test.ts` (C), `coverage-gaps.test.ts` (C), `fr5-fr6-security.test.ts` (I: COND-45) |
| Allow-list REST readout | `control-plane/rest/keys.routes.ts` + `web` | BR-18 | `rest-coverage.test.ts` (I) |

## FR7 — Conversation architecture (SRS 3.2.5.1, .2)

*Agent-controlled and component-controlled conversation architectures.*

| Feature | Module | Rules | Tests |
|---|---|---|---|
| One `ConversationHandler` interface, shared transport | `agent/architecture/conversation-handler.ts` | BR-21, A7.1 | `broadcast-keyholder-misc.test.ts` (C: COND-46) |
| Agent-controlled handler (state machine on the agent) | `agent/architecture/agent-controlled.ts` | BR-21 | `conversation-handlers.test.ts` (C: all payload kinds + pong) |
| Component-controlled router + pluggable components | `agent/architecture/component-controlled.ts` | BR-21 | `conversation-handlers.test.ts` (C: routing + unrouted) |
| Live switch — handler swap only, sockets untouched | `agent/agent.ts` + `agents` route | A7.2 | `agent-orchestration.test.ts` (C), `agent-inbound-paths.test.ts` (C: both directions), `fr7-architecture.test.ts` (I: COND-47/48), `fr2-6-7.test.ts` (I: COND-49 marker) |
| Use Case, switch observable in the harness | `web/pages/Architecture.tsx` | — | **S** — TC-15 (manual, Phase 13) |

## NFR8 — Compatibility with agentMom 1.2 (SRS 3.2.6.1)

| Feature | Module | Rules | Tests |
|---|---|---|---|
| Frozen `AgentMom1_2` interface — signatures never modified | `agent/legacy/agentmom-1_2-adapter.ts` | BR-22, A8.1 | `broadcast-keyholder-misc.test.ts` (C: COND-50 signature snapshot) |
| Legacy send = thin subset wrapper, `encrypted:false` hardcoded | `agent/legacy/agentmom-1_2-adapter.ts` | BR-22 | `coverage-gaps.test.ts` (C), `agent-orchestration.test.ts` (C: legacy round-trip) |
| **Declared limitation:** self-authored contract, non-JVM (A8.2, CON-09) | `DEVIATIONS.md` D-1, `web/pages/Compatibility.tsx` | A8.2 | evaluated by inspection — **Part 3A** |
| Legacy send works with every new feature active | end-to-end | 3.2.6.1 | **S** — COND-51 (manual, Phase 13) |

## NFR9 — Best-effort reliability (SRS 2.4.1)

| Feature | Module | Rules | Tests |
|---|---|---|---|
| **No ack / retry / resend path anywhere** (satisfied by absence) | `agent/transports/*` | BR-23, A9.1, A9.2 | `traceability.test.ts` (U: COND-52 static inspection), `dod.test.ts` (U: §20.9) |
| Packet-loss simulator (demo aid; multicast/broadcast only, never unicast) | `agent/reliability/best-effort-simulator.ts` | BR-23 | `broadcast-keyholder-misc.test.ts` (C), `coverage-gaps.test.ts` (C: fractional rate), `agent-inbound-paths.test.ts` (C: dropped sends) |
| A dropped datagram is never retransmitted | end-to-end | BR-23 | `fr2-fr3-delivery.test.ts` (I: COND-53) |
| **Declared limitation:** SRS sets no delivery-rate threshold | `evidence/PHASE-10-VERIFICATION.md` | — | evaluated against a surrogate — **Part 3A** |

## NFR10 — Basic security only (SRS 2.4.2)

| Feature | Module | Rules | Tests |
|---|---|---|---|
| **No strength / key-length / resistance claim** in code, UI or docs | discipline | BR-24, A10.2 | `dod.test.ts` (U: §20.8 wording scan across all source + harness + docs) |
| Fail-closed decryption (authentication error, no partial plaintext) | `core/crypto/symmetric.ts`, `agent/security/*` | BR-17 | `crypto.test.ts` (U: COND-35), `security-modules.test.ts` (C) |
| Ciphertext observed on the wire differs from plaintext | `core/crypto/symmetric.ts` | 2.4.2 | `crypto.test.ts` (U: COND-54) |
| Crypto-configuration readout (honest, plain-English) | `control-plane/rest/admin.routes.ts` + `web/pages/Admin.tsx` | A10.2 | `rest-coverage.test.ts` (I) |

---

## Supporting infrastructure (not a requirement — enables observability, A11)

| Feature | Module | Tests |
|---|---|---|
| Control plane — REST + WebSocket, agent supervisor, log aggregator | `control-plane/**` | `rest-coverage.test.ts`, `cli-boot.test.ts`, `aggregator-registry.test.ts` (I) |
| Forked-agent lifecycle (spawn / kill / restart-off / orphan-proof shutdown) | `control-plane/agent-supervisor.ts`, `agent/main.ts` | `rest-coverage.test.ts` (I), `cli-boot.test.ts` (I) |
| React harness — 8 pages, three-state status badges, live topology | `web/**` | **S** — manual (plan §12.2); verified via Playwright |

**Every one of the 54 test conditions is carried by a Table B case or an automated
test — `traceability.test.ts` fails the build on any orphan. Full requirement →
condition → case → result chain is in `TRACEABILITY.md`.**
