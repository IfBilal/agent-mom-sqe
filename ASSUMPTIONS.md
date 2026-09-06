# ASSUMPTIONS.md

Generated from §4 of `docs/agentmom-implementation-plan-v2.md`. **This register is the
single source of truth.** The Part 1 report table derives from here and must never drift.

Exactly three labels are legal, per the assignment brief: **Supported by SRS**,
**Design decision**, **Unsupported**. No hybrids.

| ID | Assumption | Label | Lives in |
|---|---|---|---|
| **A1.1** | TCP is the unicast transport. | Supported by SRS (2.1.2) | `packages/agent/src/transports/unicast-transport.ts` |
| **A1.2** | Exactly one persistent TCP connection per ordered agent pair, so TCP's per-connection ordering suffices; no application resequencing is built. | Design decision | `packages/agent/src/transports/unicast-transport.ts` |
| **A2.1** | Leave takes effect immediately; in-flight datagrams are dropped. | Design decision | `packages/agent/src/membership/group-membership-manager.ts` |
| **A2.2** | Destination-group attribution under simultaneous membership is achieved by binding one socket per joined group. | Design decision | `packages/agent/src/transports/multicast-transport.ts` |
| **A3.1** | A default TTL applies when the sender sets none. | **Unsupported** — SRS is silent | `packages/core/src/constants.ts` |
| **A3.2** | TTL is *additionally* enforced at the receiving application layer (`ttl <= 0` → drop). A different mechanism from the router-hop definition in SRS §1.3. | Design decision | `packages/core/src/protocol/multicast-framing.ts`, `packages/agent/src/transports/multicast-transport.ts` |
| **A3.3** | Payloads above `MAX_DATAGRAM_BYTES` are rejected rather than fragmented. | Design decision — implementation safety rail, not SRS-derived | `packages/core/src/protocol/multicast-framing.ts` |
| **A4.1** | Limited broadcast `255.255.255.255` satisfies "all possible hosts under the same local network," with a subnet-directed fallback. | Design decision — SRS names no address | `packages/agent/src/transports/broadcast-transport.ts` |
| **A4.2** | The development and test machines permit broadcast without administrator restriction. | **Unsupported** — 2.4.4 states the opposite may hold | `packages/agent/src/transports/broadcast-transport.ts` |
| **A5.1** | AES-256-GCM is used. | Design decision — SRS names no algorithm | `packages/core/src/crypto/symmetric.ts` |
| **A5.2** | One shared symmetric key per unordered agent pair, derived deterministically; no key-exchange handshake. | **Unsupported** — 2.5.3 covers multicast only; SRS is silent on unicast keys | `packages/core/src/crypto/symmetric.ts`, `packages/agent/src/security/unicast-security.ts` |
| **A5.3** | `encrypted = true` without `iv`/`authTag` is malformed and dropped. | Design decision | `packages/core/src/validation/envelope-validator.ts` |
| **A6.1** | A key holder exists and gates distribution by allow-list. | Supported by SRS (2.5.3) | `packages/agent/src/key-holder/key-holder-agent.ts` |
| **A6.2** | The group key is never rotated or revoked on leave; a departed agent retains it. | **Unsupported** — SRS silent | `packages/agent/src/key-holder/key-holder-agent.ts` |
| **A6.3** | Key request/response are always encrypted, overriding the 3.2.4.3 opt-out. | Design decision | `packages/core/src/crypto/key-holder-protocol.ts` |
| **A7.1** | Both architectures share one transport layer behind a common interface. | Design decision | `packages/agent/src/architecture/*.ts` |
| **A7.2** | Architecture mode is switchable at runtime without restarting sockets. | Design decision — added for demonstrability; SRS does not require it | `packages/agent/src/architecture/*.ts`, `packages/agent/src/main.ts` |
| **A8.1** | "Compatible" means the 1.2 public interface signatures are unchanged and new features are additive only. | Design decision — SRS does not define compatibility at interface level | `packages/agent/src/legacy/agentmom-1_2-adapter.ts` |
| **A8.2** | The 1.2 surface is reconstructed by us from SRS §2.2, because no reference implementation is obtainable. | **Unsupported** — a self-authored contract cannot evidence compatibility with the real 1.2 | `packages/agent/src/legacy/agentmom-1_2-adapter.ts` |
| **A9.1** | Best-effort delivery permits loss. | Supported by SRS (2.4.1) | — |
| **A9.2** | Therefore no ack/retry/resend layer exists. | Design decision — 2.4.1 permits failure but does not prohibit mitigation; choosing not to mitigate is ours | *(absence — verified statically)* |
| **A10.1** | A standard symmetric algorithm suffices; AES-256-GCM chosen. | Design decision | `packages/core/src/crypto/symmetric.ts` |
| **A10.2** | No strength, key-length or resistance claim is made or tested. | Supported by SRS (2.4.2 explicitly disclaims any guarantee) | *(discipline — verified by inspection)* |
| **A11** | The GUI is a test harness over the framework, introduced to satisfy the assignment's observability requirement. The SRS specifies a developer framework (§2.1, §2.3) and contains no interface requirements. | Design decision — not traceable to any SRS clause | `packages/web/**` |

**A11 note.** No expected result anywhere in Part 3 may be asserted about the harness itself.
Every expected result is asserted about framework behaviour *observed through* the harness.
