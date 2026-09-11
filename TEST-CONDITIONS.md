# TEST-CONDITIONS.md

Generated from §13 of `docs/agentmom-implementation-plan-v2.md`. Fifty-four conditions
across all 10 requirements.

Level tags: **U** unit · **C** component · **I** integration · **S** system.
Category tags: **N** normal · **B** boundary · **E** invalid/error · **BR** business rule.

The chain: **TEST BASIS → CONDITION (COND-nn) → TEST CASE (TC-nn) → RESULT → DEFECT (BUG-nn, only if confirmed)**.

## FR1 — Unicast

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-01 | BR-02 | An envelope survives `encodeFrame` → `decode` unchanged at arbitrary size | U | N |
| COND-02 | BR-02 | A frame split across two `data` events is reassembled into exactly one envelope | U | B |
| COND-03 | BR-02 | Two frames coalesced into one `data` event are separated into exactly two envelopes | U | B |
| COND-04 | 3.2.1.1/.2 | A send establishes a connection and the addressed agent receives the envelope | C | N |
| COND-05 | BR-01 | An envelope whose `recipientId` ≠ this agent is dropped and raises `PROTOCOL_VIOLATION` | C | BR |
| COND-06 | 3.2.1.3 | A message sent A→B is not received by C | I | BR |
| COND-07 | 3.2.1.4 | 50 messages sent A→B arrive in the order sent | I | N |
| COND-08 | BR-03 | A `sequenceNumber` of `lastSeen + 2` raises `SEQUENCE_ANOMALY`; `lastSeen + 1` does not | U | B |
| COND-09 | A1.2 | Sending to a stopped agent surfaces a connection error, not a crash | I | E |
| COND-10 | SRS UC2 | Use Case 2 re-enacted end-to-end through the harness | S | N |

## FR2 — Multicast membership

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-11 | 3.2.2.3 | `join()` transitions `NOT_MEMBER` → `JOINING` → `MEMBER` | C | N |
| COND-12 | BR-04 | A datagram arriving before the group is in the membership set is dropped | C | B |
| COND-13 | BR-06 | `leave()` removes from the membership set **before** calling `dropMembership` | C | BR |
| COND-14 | 3.2.2.5 | A message sent to a group before an agent joins is not delivered to it | I | BR |
| COND-15 | 3.2.2.6 | A message sent to a group after an agent leaves is not delivered to it | I | BR |
| COND-16 | 3.2.2.9 / BR-07 | An agent joined to α and β receives from both, each attributed to the correct group | I | N |
| COND-17 | SRS UC1 | Use Case 1 (join/leave) re-enacted through the harness | S | N |
| COND-18 | BR-06 | A message inbound in the same event-loop tick as `leave()` is dropped, not delivered | I | B |

## FR3 — Multicast messaging

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-19 | BR-09 | `ttl = 1` is deliverable; `ttl = 0` is expired — exact boundary | U | B |
| COND-20 | 3.2.2.7 | A send applies `setMulticastTTL` and stamps `ttl` into the envelope | C | N |
| COND-21 | BR-09 | A received envelope with expired TTL raises `MESSAGE_DROPPED_TTL_EXPIRED` and is not delivered | I | BR |
| COND-22 | SRS §1.3 | OS-level `setMulticastTTL(0)` confines a datagram to the originating host | I | N |
| COND-23 | 3.2.2.8 | Group address and port are reconfigurable at runtime and take effect on the next send | C | N |
| COND-24 | BR-10 | A destination outside `224.0.0.0/4` is rejected at send time | C | E |
| COND-25 | BR-11 | A payload at exactly `MAX_DATAGRAM_BYTES` is accepted; at `+1` it is rejected — exact boundary | U | B |
| COND-26 | 3.2.2.1/.2 | A multicast send reaches every current member of the group | I | N |
| COND-27 | SRS UC3 | Use Case 3 re-enacted through the harness | S | N |

## FR4 — Broadcast

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-28 | BR-12 | The broadcast socket binds with `reuseAddr` and sets `setBroadcast(true)` after bind | C | N |
| COND-29 | 3.2.3.1/.2 | A broadcast send is received by every agent on the same host | I | N |
| COND-30 | 3.2.3.3 | A broadcast is **sent to** all possible hosts under the same local network | S | N |
| COND-31 | BR-13 | `EACCES`/`EPERM` surfaces as `BROADCAST_PERMISSION_DENIED`, not a crash | C | E |
| COND-32 | BR-12 | Where limited broadcast is not routed, the subnet-directed fallback is used and `addressUsed` reports it | C | E |
| COND-33 | SRS UC4 | Use Case 4 re-enacted through the harness | S | N |

## FR5 — Unicast security

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-34 | 3.2.4.1/.2 | AES-256-GCM encrypt → decrypt round-trips to the original plaintext | U | N |
| COND-35 | BR-17 | A tampered `authTag` causes decryption to throw; no plaintext is produced | U | E |
| COND-36 | A5.2 | Pairwise key derivation is order-independent: `key(A,B) === key(B,A)` | U | N |
| COND-37 | BR-16 | `encrypted = true` with `iv` or `authTag` missing is malformed: dropped, no decryption attempted | C | E |
| COND-38 | BR-14 | A message sent with `encrypted = false` travels as plaintext; the same body with `encrypted = true` differs on the wire | I | BR |
| COND-39 | 3.2.4.4 | The receiver decrypts automatically with no user action | I | N |
| COND-40 | BR-17 | Decryption with the wrong key raises `DECRYPTION_FAILED` and delivers nothing | I | E |

## FR6 — Multicast security

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-41 | BR-18 | An allow-listed agent's key request is granted | C | BR |
| COND-42 | BR-18 | A non-allow-listed agent's key request is denied and raises `GROUP_KEY_DENIED` | C | E |
| COND-43 | BR-19 | Key request and response are encrypted regardless of the sender's opt-out setting | I | BR |
| COND-44 | 3.2.4.5/.6 | An encrypted multicast is readable by key-holding members and raises `DECRYPTION_FAILED` for others | I | N |
| COND-45 | BR-20 / A6.2 | After leaving, an agent that already holds the group key can still decrypt captured traffic | I | BR |

## FR7 — Conversation architecture

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-46 | BR-21 | Both handlers satisfy the `ConversationHandler` interface | U | N |
| COND-47 | 3.2.5.1/.2 | Delivery behaviour is identical before and after a live architecture switch | I | N |
| COND-48 | A7.2 | A switch replaces only the handler; sockets and connections are not restarted | I | BR |
| COND-49 | 3.2.5.1/.2 | The switch is observable in the harness with an `ARCHITECTURE_SWITCHED` marker | S | N |

## NFR8 / NFR9 / NFR10

| ID | Basis | Condition | Lvl | Cat |
|---|---|---|---|---|
| COND-50 | BR-22 | The `AgentMom1_2` signature snapshot matches the frozen contract byte for byte | U | BR |
| COND-51 | 3.2.6.1 | A legacy-only send succeeds while every new feature is simultaneously active | S | N |
| COND-52 | BR-23 | No ack, retry or resend symbol exists on any multicast or broadcast path (static inspection) | C | BR |
| COND-53 | BR-23 / 2.4.1 | A dropped datagram is never retransmitted | I | BR |
| COND-54 | 2.4.2 | Ciphertext observed on the wire differs from the plaintext body | I | BR |
