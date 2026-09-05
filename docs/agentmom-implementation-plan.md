# agentMom — Broadcasting / Multicasting / Secured Communication
## Full End-to-End Implementation Plan (Engineering Specification for Claude Code)

**Project:** SE3002 Assignment 01 — Quality Evaluation of AI-Generated Software
**Base SRS:** "Applying Broadcasting/Multicasting/Secured Communication to agentMom in Multi-Agent Systems," v1.1 (Kansas State University, 2003)
**Team:** M. Bilal Tahir (24i-3166), Taimoor Shaukat (24i-3015) — Section SE-B
**Scope covered by this document:** Part 2 of the assignment — "AI-Generated GUI Baseline." This is the build spec for the actual application. It does NOT cover SonarQube execution, Jira defect logging, or the final quality judgment (those are Part 3/Part 4 deliverables, produced *after* this baseline is frozen).

**How to use this document (instructions to whoever/whatever is building this — including Claude Code):**
Follow the phases in order. Do not skip ahead. Each phase ends in a runnable, demoable state. Do not "improve" the scope beyond what's listed — the 10 requirements below are locked to what Part 1 of the report already selected and defended. If you notice the SRS or the report table implies something not covered here, flag it instead of silently inventing behavior — every invented behavior must be traceable back to an "AI assumption" entry, exactly like Part 1 already did. When you hit a decision point that isn't specified below, make the same call the Part 1 table already made (referenced by section number) rather than a new one, so the report and the code stay consistent with each other.

---

## 0. Requirement Traceability (locked scope — do not add or remove items)

This is the exact 10-requirement scope from the Part 1 table. Every line of code in this project must map to one of these rows. Nothing else gets built.

| # | Req. ID(s) | Type | Name used in this plan | One-line behavior |
|---|---|---|---|---|
| 1 | 3.2.1.1–3.2.1.4 | FR | `UNICAST` | Send/receive unicast message; only the addressed agent receives it; messages from one sender to one receiver arrive in order. |
| 2 | 3.2.2.3–3.2.2.6 | FR | `MULTICAST_MEMBERSHIP` | Join/leave a multicast group; no delivery before join or after leave. |
| 3 | 3.2.2.1, 3.2.2.2, 3.2.2.7, 3.2.2.8, 3.2.2.9 | FR | `MULTICAST_MESSAGING` | Send/receive multicast message; per-message TTL; configurable multicast address/port; receive from multiple groups at once. |
| 4 | 3.2.3.1–3.2.3.3 | FR | `BROADCAST` | Send/receive broadcast message; reaches every host on the local network segment. |
| 5 | 3.2.4.1–3.2.4.4 | FR | `UNICAST_SECURITY` | Encrypt/decrypt unicast message; sender opts in/out of encryption; receiver auto-decrypts if encrypted. |
| 6 | 3.2.4.5, 3.2.4.6 | FR | `MULTICAST_SECURITY` | Encrypt/decrypt multicast message using a group key from a key-holder agent. |
| 7 | 3.2.5.1, 3.2.5.2 | FR | `CONVERSATION_ARCHITECTURE` | Support both "agent controls conversation" and "agent's components control conversation" architectures. |
| 8 | 3.2.6.1 | NFR (Compatibility) | `COMPAT_1_2` | New agentMom does not break agentMom 1.2 public interfaces. |
| 9 | 2.4.1 | NFR (Reliability) | `BEST_EFFORT_DELIVERY` | Multicast/broadcast delivery is best-effort; no retry, no ack, no guarantee. |
| 10 | 2.4.2 | NFR (Security) | `BASIC_SECURITY_ONLY` | Encryption exists but is not claimed to be unbreakable; no algorithm strength promised by the SRS. |

Every FR above needs an **observable, demoable GUI action with visible success/error feedback** (assignment Part 2 rubric line). Every NFR needs to be **inspectable at runtime** (a config toggle, a log line, or a status readout) because Part 3 will need to point at concrete evidence for it later — build the hooks now even though you don't have to write the Part 3 analysis now.

---

## 1. Technology Stack Decision

| Layer | Choice | Why |
|---|---|---|
| Agent runtime / networking | Node.js 20+, TypeScript, native `net` (TCP) and `dgram` (UDP) modules | UDP multicast/broadcast and raw TCP socket control are first-class in `dgram`/`net` with no extra native dependencies; keeps the whole stack in one language. |
| Inter-agent transport | Real TCP sockets for unicast; real UDP multicast sockets for multicast; real UDP broadcast sockets for broadcast | The SRS explicitly ties each mode to a transport (section 2.1.2) — using the actual OS-level primitives (not a simulated in-memory bus) is what makes 3.2.1.4 (TCP ordering), 2.4.1 (best-effort/lossy), and 2.4.4-style broadcast permission issues *actually observable* during testing, instead of faked. |
| Agent process model | Each "agent" is a Node.js **child process** (via `node:child_process` `fork()`), not just an in-memory object | Gives every agent its own real socket, its own real port, and lets broadcast/multicast behave like it would across real hosts, while still being demoable on one machine. This also makes "Agent_B suffers a failure" scenarios from the SRS use cases literally simulate-able (kill the child process). |
| Orchestration/control-plane backend | Node.js + Express, single "Control Plane" process | Spawns/kills agent child processes, exposes REST + WebSocket API to the GUI, aggregates each agent's log stream. |
| Frontend GUI | Next.js 14 (App Router) + TypeScript + Tailwind | Matches existing stack competency; server components for static structure, client components for live socket state. |
| Encryption | Node `crypto` module, AES-256-GCM, symmetric keys | Matches Part 1's "Defence/basis" claim of "standard symmetric encryption algorithm... no specific strength requirement." Do not deviate to asymmetric crypto — that would contradict what the report already defended. |
| Persistence | None required; in-memory state in Control Plane, rehydrated from agent logs | The SRS describes a messaging framework, not a data-management system — this is also *why* Part 1 justified 0 CRUD FRs. Do not add a database; that would undercut the CRUD-exemption argument already made in Part 1. |
| Local network transport for multicast/broadcast | `224.1.1.1:5007` reserved for multicast group traffic (configurable per FR3); `255.255.255.255` (or subnet-directed broadcast, see §6.3) on a dedicated UDP port for broadcast | Real IANA-safe multicast range (239.0.0.0/8 or 224.0.0.0/24 local scope — see §5.4 for exact choice and why). |

**Do not substitute a WebSocket-only "fake" multicast/broadcast simulation.** The whole point of Part 3/4 later is testing against real transport behavior (e.g., "does a message arrive before join," "does broadcast actually reach every host"). If this is faked in-memory, the FAILED/BLOCKED test cases required later (assignment Part 3B) lose their evidentiary basis.

---

## 2. Repository Structure

```
agentmom/
├── README.md                          # setup + run instructions (submission requirement)
├── ASSUMPTIONS.md                      # mirrors Part 1 AI-assumption column, one entry per requirement, linked to code
├── .env.example
├── package.json                        # npm workspaces root
├── tsconfig.base.json
│
├── packages/
│   ├── core/                           # shared types, message schema, crypto helpers — used by agent + control-plane
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── message.ts
│   │   │   │   ├── agent-state.ts
│   │   │   │   └── control-plane-api.ts
│   │   │   ├── crypto/
│   │   │   │   ├── symmetric.ts
│   │   │   │   └── key-holder-protocol.ts
│   │   │   ├── protocol/
│   │   │   │   ├── unicast-framing.ts
│   │   │   │   ├── multicast-framing.ts
│   │   │   │   └── broadcast-framing.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent/                          # the actual agentMom agent runtime (spawned as child process)
│   │   ├── src/
│   │   │   ├── main.ts                 # entrypoint, reads config from argv/env, starts sockets
│   │   │   ├── config.ts
│   │   │   ├── transports/
│   │   │   │   ├── unicast-transport.ts        # TCP server + client pool
│   │   │   │   ├── multicast-transport.ts      # UDP multicast socket
│   │   │   │   └── broadcast-transport.ts      # UDP broadcast socket
│   │   │   ├── membership/
│   │   │   │   └── group-membership-manager.ts # FR2 join/leave state machine
│   │   │   ├── security/
│   │   │   │   ├── unicast-security.ts         # FR5
│   │   │   │   └── multicast-security.ts       # FR6, talks to key-holder-agent
│   │   │   ├── key-holder/
│   │   │   │   └── key-holder-agent.ts         # special agent role, section 2.5.3
│   │   │   ├── architecture/
│   │   │   │   ├── agent-controlled.ts         # FR7 variant A
│   │   │   │   └── component-controlled.ts     # FR7 variant B
│   │   │   ├── legacy/
│   │   │   │   └── agentmom-1_2-adapter.ts     # NFR8 compatibility shim
│   │   │   ├── reliability/
│   │   │   │   └── best-effort-simulator.ts    # NFR9 configurable drop
│   │   │   ├── ipc.ts                          # child process <-> control plane messages (status, logs)
│   │   │   └── message-ordering-buffer.ts      # FR1 in-order guarantee, per-connection sequencing
│   │   └── package.json
│   │
│   ├── control-plane/                  # backend orchestrator + API server
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── agent-registry.ts       # tracks spawned agent processes, ports, state
│   │   │   ├── agent-supervisor.ts     # fork/kill child processes, restart-on-crash toggle OFF (we want visible crashes for testing)
│   │   │   ├── rest/
│   │   │   │   ├── agents.routes.ts
│   │   │   │   ├── messages.routes.ts
│   │   │   │   ├── groups.routes.ts
│   │   │   │   ├── keys.routes.ts
│   │   │   │   └── admin.routes.ts     # broadcast-permission toggle, drop-rate toggle, TTL default toggle
│   │   │   ├── ws/
│   │   │   │   └── live-events.ts      # pushes per-agent log lines + state changes to GUI
│   │   │   └── log-aggregator.ts
│   │   └── package.json
│   │
│   └── web/                             # Next.js GUI
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx                 # dashboard: agent topology view
│       │   ├── agents/[agentId]/page.tsx
│       │   ├── unicast/page.tsx         # FR1 screen
│       │   ├── multicast/page.tsx       # FR2 + FR3 screen
│       │   ├── broadcast/page.tsx       # FR4 screen
│       │   ├── security/page.tsx        # FR5 + FR6 screen
│       │   ├── architecture/page.tsx    # FR7 screen
│       │   ├── compatibility/page.tsx   # NFR8 screen
│       │   └── admin/page.tsx           # NFR9 + NFR10 controls & readouts
│       ├── components/
│       │   ├── AgentTopologyGraph.tsx
│       │   ├── MessageComposer.tsx
│       │   ├── MessageLog.tsx
│       │   ├── GroupMembershipPanel.tsx
│       │   ├── EncryptionToggle.tsx
│       │   ├── ArchitectureSwitch.tsx
│       │   ├── ReliabilityDial.tsx      # drop-rate slider for NFR9 demo
│       │   └── StatusBadge.tsx          # PASS/FAIL/pending visual, green/red/gray
│       ├── lib/
│       │   ├── api-client.ts
│       │   └── ws-client.ts
│       └── package.json
│
├── scripts/
│   ├── dev-up.sh                        # starts control-plane + web concurrently
│   ├── spawn-demo-agents.sh              # spins up a standard 4-agent demo topology (Agent_A..D, matching SRS use cases)
│   └── freeze-baseline.sh                # git tag + zip snapshot for SonarQube/testing (Part 3/4 prep, run once scope is done)
│
└── docs/
    └── message-formats.md               # canonical JSON schemas, copy of §4 below for quick reference during coding
```

**Rule for Claude Code:** create `packages/core` completely and get it compiling before touching `agent`, `control-plane`, or `web`. All three depend on it and re-defining types in each package independently is exactly the kind of duplication SonarQube will flag later.

---

## 3. Domain Model — Agents, Roles, and the Demo Topology

Every "agent" is a standalone Node.js process with:
- a unique `agentId` (string, e.g. `"agent-A"`)
- one TCP listener for unicast (`unicastPort`)
- one UDP socket joined to zero-or-more multicast groups (`multicastPort`, shared across groups per host — a single socket can join multiple groups, see §5.2)
- one UDP socket for broadcast (`broadcastPort`)
- a `role`: `"standard"` or `"key-holder"` (section 2.5.3 — exactly one key-holder agent per demo topology, other agents request the shared key from it)
- a `conversationArchitecture`: `"agent-controlled"` or `"component-controlled"` (FR7 toggle, per-agent, changeable at runtime for demo purposes)

**Default demo topology** (spun up by `scripts/spawn-demo-agents.sh`, matching the SRS's own Figures 1–4 so the GUI demo can literally re-enact the SRS use cases):

| Agent | Role | Unicast port | Multicast port | Broadcast port | Notes |
|---|---|---|---|---|---|
| `agent-A` | standard | 7001 | 8001 | 9001 | Initiates unicast (Fig. 2), joins multicast group late (Fig. 1) |
| `agent-B` | standard | 7002 | 8002 | 9001 | Leaves multicast group mid-demo (Fig. 1) |
| `agent-C` | standard | 7003 | 8003 | 9001 | Multicast group member throughout (Fig. 3) |
| `agent-D` | key-holder | 7004 | 8004 | 9001 | Holds & distributes the shared multicast/unicast keys (section 2.5.3); also a plain group member for broadcast |

All four share the **same broadcast port (9001)** because broadcast is inherently "reach every host on the local network" — one shared port matches that semantic. Multicast ports differ per agent because each agent's multicast *socket* is separate even though they can all bind to the **same multicast group address** (e.g. `239.1.1.5:5007`, see §5.4) — the per-agent "multicast port" column above is actually each agent's own receive port for the multicast group, reusable across the demo. (Clarify this exactly in code comments — it's a common source of confusion and will come up in the viva.)

---

## 4. Canonical Message Schema (`packages/core/src/types/message.ts`)

Every message on every transport (unicast/multicast/broadcast) uses this envelope. Encryption wraps the `payload` field only; the envelope metadata is always sent in clear so recipients can decide whether/how to decrypt before parsing the body.

```typescript
export type TransportMode = "unicast" | "multicast" | "broadcast";

export interface MessageEnvelope {
  id: string;                    // uuid v4, generated at send time
  mode: TransportMode;
  senderId: string;              // agentId
  recipientId?: string;          // required for unicast; the addressed agent (3.2.1.3)
  groupAddress?: string;         // required for multicast (3.2.2.8)
  sequenceNumber: number;        // per (sender, recipient) monotonically increasing — see §5.1 ordering
  timestampSentMs: number;
  ttl?: number;                  // multicast only (3.2.2.7); hop count, decremented per relay (see §5.3)
  encrypted: boolean;            // 3.2.4.3 — sender's explicit choice
  payload: string;               // plaintext JSON string, OR base64 AES-GCM ciphertext if encrypted === true
  iv?: string;                   // base64, present iff encrypted === true (AES-GCM requires a fresh IV per message)
  authTag?: string;              // base64 AES-GCM auth tag, present iff encrypted === true
}

export interface DecryptedPayload {
  kind: "chat" | "ping" | "join-notify" | "leave-notify" | "task-bid" | "system";
  body: Record<string, unknown>;
}
```

**Rules Claude Code must follow exactly:**
1. `sequenceNumber` is scoped to the `(senderId, recipientId)` pair for unicast — this is what makes FR1's "arrive in order" testable and enforceable (see §5.1). It is NOT a global counter.
2. `ttl` only appears on multicast envelopes. On unicast/broadcast it must be `undefined` — do not repurpose it as a generic "hop limit" for other modes; that's outside the locked scope.
3. `encrypted: false` messages must have `iv` and `authTag` both `undefined`, not empty strings. Treat any envelope with `encrypted: true` but missing `iv`/`authTag` as malformed — log and drop it, do not attempt decryption (this becomes one of your natural invalid-input test cases later in Part 3).

---

## 5. Transport-by-Transport Implementation Detail

### 5.1 Unicast (FR1 — `UNICAST`, req. 3.2.1.1–3.2.1.4)

- **Transport:** one persistent TCP connection per ordered pair of agents that have exchanged at least one message. `unicast-transport.ts` maintains a `Map<agentId, net.Socket>` per agent process — lazily connects on first send, reuses the connection after that.
- **Framing:** TCP is a byte stream, not message-boundaries, so every envelope is length-prefixed: 4-byte big-endian `UInt32` byte length, followed by the UTF-8 JSON-encoded `MessageEnvelope`. Implement in `unicast-framing.ts` as `encodeFrame(envelope): Buffer` and a streaming `FrameDecoder` class that buffers partial reads (`net.Socket` `data` events can split or coalesce frames — this must be handled, do not assume one `data` event equals one message).
- **Addressing (3.2.1.3):** The TCP server for agent X only accepts application-layer envelopes where `recipientId === X.agentId`; if a connection somehow delivers a mismatched `recipientId` (shouldn't happen given point-to-point TCP, but defend anyway), drop and log it as a protocol violation. This is what makes 3.2.1.3 independently demonstrable/testable rather than just "true because TCP is point-to-point."
- **Ordering (3.2.1.4):** Because a single TCP connection is reused per sender→receiver pair, TCP's own in-order byte delivery is the actual mechanism — this matches Part 1's SRS-supported AI assumption exactly ("relying on the underlying TCP connection is enough to satisfy the in-order requirement"). Implement `message-ordering-buffer.ts` purely as a **verification/observability layer**, not a re-ordering mechanism: on receipt, check that `sequenceNumber` is exactly `lastSeen + 1` for that sender; if not, log a `SEQUENCE_ANOMALY` warning (this is your evidence hook for Part 3 testing — a deliberately reconnected/duplicated connection is a good BLOCKED or FAILED test case later). Do not build actual reordering/buffering logic — that would exceed what TCP-reliance justifies and would contradict the Part 1 "Defence/basis" already written.
- **GUI action:** `unicast/page.tsx` — dropdown to pick sender + recipient agent, message body textarea, encrypt toggle (wired to FR5), "Send" button. On send, POST `/api/messages/unicast`. Response panel shows: sent envelope, delivery confirmation event (via WebSocket) with round-trip latency, or a red error state if the recipient agent process isn't running (connection refused) — this second case is your natural "invalid/error condition" test target for Part 3.

### 5.2 Multicast Group Membership (FR2 — `MULTICAST_MEMBERSHIP`, req. 3.2.2.3–3.2.2.6)

- **Mechanism:** Node's `dgram` socket supports `socket.addMembership(multicastAddress[, multicastInterface])` and `socket.dropMembership(multicastAddress)`. `group-membership-manager.ts` wraps these two calls behind explicit `join(groupAddress)` / `leave(groupAddress)` methods, and — critically — maintains its own **application-level membership set** (`Set<string>` of group addresses) independent of the OS call, because the required behavior is:
  - **3.2.2.5:** no delivery *before* joining — even if a UDP packet physically arrives on the socket (e.g., because the OS join is still in flight, or because the process is mid-startup), the manager must check `membershipSet.has(groupAddress)` before handing the payload up to the application layer, and silently drop it (with a debug log) if not a member yet.
  - **3.2.2.6:** no delivery *after* leaving — same check, symmetric case. This is also exactly where Part 1's "AI assumption" about leave taking effect immediately and in-flight messages being dropped gets implemented: `leave(groupAddress)` must synchronously remove the address from `membershipSet` **before** calling `dropMembership`, so the window where "OS still delivers, but app-level check already rejects" is the deliberately chosen behavior, not a race condition you stumbled into. Comment this in code with a reference to the report row so it's traceable in the viva.
- **State machine** (per agent, per group):
  ```
  NOT_MEMBER --join()--> JOINING --(OS addMembership resolves)--> MEMBER
  MEMBER --leave()--> NOT_MEMBER   (membershipSet update is synchronous & immediate, per assumption above)
  ```
  Expose current state per group in the agent's `/status` IPC payload so the GUI can render it live.
- **GUI action:** `multicast/page.tsx` → `GroupMembershipPanel.tsx` — per agent, list of known group addresses with Join/Leave buttons and a live badge (`MEMBER` / `NOT_MEMBER` / `JOINING`). Include a deliberate **"send while leaving" demo button** that fires a leave and an inbound test multicast message from another agent within the same event loop tick, so the drop-on-leave behavior is visibly demoable — this is your GUI hook for the FR2 test case in Part 3.

### 5.3 Multicast Messaging (FR3 — `MULTICAST_MESSAGING`, req. 3.2.2.1, .2, .7, .8, .9)

- **Send:** `multicast-transport.ts` exposes `sendMulticast(groupAddress, port, envelope)` — creates/reuses a UDP socket, calls `socket.send(buffer, port, groupAddress)`. No framing/length-prefix needed (UDP is already message-boundary-preserving — one `socket.send` = one datagram = one `message` event on receivers, unless payload exceeds MTU, see note below).
- **TTL (3.2.2.7):** UDP multicast sockets have a native `socket.setMulticastTTL(n)` which controls **router hop count**, not application semantics. Because this demo topology runs on localhost/LAN (TTL of 1 already reaches everything needed), implement TTL at **two levels** to keep it meaningful for the GUI demo:
  1. Call `socket.setMulticastTTL(envelope.ttl ?? DEFAULT_TTL)` on send (real OS-level effect, even if not visibly different on localhost).
  2. Also stamp `ttl` into the envelope itself and have each receiving agent's application layer treat `ttl <= 0` as "expired, do not process, log `TTL_EXPIRED`" — purely a software-level enforcement so the GUI can actually demonstrate TTL expiry deterministically regardless of network topology. Document in code comments that level 2 is the AI's own addition to make an otherwise network-invisible property demoable, distinct from the actual OS TTL call in level 1.
  - **DEFAULT_TTL constant:** set to `1` in `packages/core/src/protocol/multicast-framing.ts`, with a comment citing Part 1's row: *"The AI assumed a default TTL value applies when the calling agent does not set one... Unsupported [by SRS]."* This is the literal code manifestation of that flagged assumption — keep the constant named `DEFAULT_TTL_UNSUPPORTED_ASSUMPTION` so it's unmistakable in a code review / SonarQube pass that this is a deliberate, flagged, non-SRS-derived value, not a magic number smell.
- **Address/port configuration (3.2.2.8):** expose `setMulticastAddress(agentId, groupAddress, port)` as an admin/config action, not hardcoded — `multicast/page.tsx` includes an address/port config form per agent so this requirement has its own explicit, separately-clickable GUI action distinct from "send a multicast message."
- **Multiple simultaneous groups (3.2.2.9):** a single UDP socket can call `addMembership` multiple times for different multicast addresses on the same port; `group-membership-manager.ts` must support a `Set<groupAddress>` per agent (not a single string), and the receive handler must dispatch based on which group address the datagram was sent to (available via `socket.on("message", (msg, rinfo) => ...)` — `rinfo.address` gives the source, but the *destination* group must be tracked by matching against each joined address the socket is bound to; implement by binding one socket per group if Node's API makes multi-group demux on one socket ambiguous — verify this during implementation and note whichever approach was used in `ASSUMPTIONS.md`, since the SRS doesn't specify this either way).
- **MTU note:** cap encrypted+encoded payload size and warn/reject if a single envelope would exceed ~60KB to avoid UDP fragmentation weirdness during the demo; this is an implementation safety rail, not an SRS requirement — do not present it as SRS-derived in any report text.

### 5.4 Broadcast (FR4 — `BROADCAST`, req. 3.2.3.1–3.2.3.3)

- **Address choice:** Use `socket.setBroadcast(true)` and send to the **limited broadcast address `255.255.255.255`** on the shared broadcast port (`9001` in the demo topology), rather than a subnet-directed broadcast — this most literally satisfies 3.2.3.3's "every possible host under the same local network" without needing to know the local subnet mask at runtime. Document this exact choice in `ASSUMPTIONS.md` since the SRS constraint 2.4.4 already flags that broadcast permission is environment-dependent — this is exactly the kind of assumption Part 1 already called out as **Unsupported** ("the AI assumed the development and test machines allow broadcast traffic without any administrator restriction").
- **Permission failure handling:** `broadcast-transport.ts` must catch `EACCES`/`EPERM` errors from `socket.send` explicitly and surface them as a distinct, user-visible GUI error state ("Broadcast permission denied by OS/network — see SRS constraint 2.4.4"), rather than letting it appear as a generic crash. This single error path is *the* concrete, demoable evidence for the "Unsupported" assumption flagged in Part 1 — when (if) this fires on the actual test/demo machine, it directly becomes a BLOCKED test case candidate for Part 3, with a clean, pre-built evidence trail. Build a **manual "simulate permission denied" admin toggle** (`admin/page.tsx`) that force-throws this same error path on demand, so the demo isn't dependent on whatever the actual grading machine's OS permissions happen to be.
- **Reachability (3.2.3.3):** all four demo agents bind to the same broadcast port; the GUI's `AgentTopologyGraph.tsx` should visually flash every agent's node when any one of them sends a broadcast, so "reached every host" is literally visible in one glance during a demo.

### 5.5 Reliability / Best-Effort Delivery (NFR9 — `BEST_EFFORT_DELIVERY`, req. 2.4.1)

- Applies **only** to multicast and broadcast (per the SRS constraint wording — do not apply artificial drop to unicast, which is TCP-backed and reliable by construction; conflating the two would contradict both the SRS and your own Part 1 FR1 assumption).
- `reliability/best-effort-simulator.ts`: a configurable `dropRate: number` (0.0–1.0, default `0`), checked with `Math.random() < dropRate` immediately before every multicast/broadcast `socket.send` call — if triggered, log `SIMULATED_DROP` and skip the actual send. This is an explicit, admin-toggleable **testing aid**, not a claim that this is how real best-effort delivery "should" be modeled — label it clearly as such in the UI (`admin/page.tsx` → `ReliabilityDial.tsx`, tooltip: "Simulates real-world packet loss for testing NFR 2.4.1. Default 0% — real UDP loss can still occur independently of this dial.").
- No acknowledgement, retry, or resend logic anywhere in the multicast/broadcast path — this is the literal implementation of the Part 1 AI assumption ("no retry or acknowledgement mechanism is needed... since best effort delivery is explicitly allowed to fail under the SRS"). Do not add a "just in case" retry — that would be scope creep that contradicts the already-written Defence/basis.

### 5.6 Security — Unicast (FR5 — `UNICAST_SECURITY`, req. 3.2.4.1–3.2.4.4)

- **Algorithm:** AES-256-GCM (`packages/core/src/crypto/symmetric.ts`), because it gives authenticated encryption (integrity + confidentiality) in one primitive with native Node `crypto` support — no external dependency needed.
- **Key model:** exactly as flagged in Part 1 — **a single shared symmetric key per unordered pair of agents**, generated deterministically at control-plane startup (`sha256(sorted([agentA, agentB]).join("|") + SHARED_SECRET_SEED)`), where `SHARED_SECRET_SEED` is a project-level constant in `.env` (`AGENTMOM_DEMO_SEED`). This is a **stand-in for a real key-exchange protocol that the SRS never specifies** — comment this loudly in `unicast-security.ts`:
  ```typescript
  // AI ASSUMPTION (Part 1, row "Unicast encryption", classified Unsupported):
  // The SRS gives no key-exchange process for unicast. This deterministic
  // pairwise-key derivation is a development-time stand-in ONLY, chosen so the
  // demo has *a* working key without inventing a full handshake protocol that
  // the SRS also never asked for. Do NOT present this as production-grade
  // key management in the final report — it is explicitly the flagged gap.
  ```
- **Sender opt-in/out (3.2.4.3):** `EncryptionToggle.tsx` on the unicast composer — a boolean the sender controls per message, not a global setting. Wired straight into `MessageEnvelope.encrypted`.
- **Auto-decrypt (3.2.4.4):** the receiving agent's unicast handler checks `envelope.encrypted` and, if `true`, automatically looks up the pairwise key and decrypts before dispatching to the application layer — no user action required on the receive side. If decryption fails (wrong/missing key, tampered `authTag`), surface a distinct `DECRYPTION_FAILED` event to the GUI rather than crashing the agent process — another clean, natural invalid-input test case for later.

### 5.7 Security — Multicast (FR6 — `MULTICAST_SECURITY`, req. 3.2.4.5, 3.2.4.6)

- **Key-holder protocol** (`key-holder-protocol.ts`, `key-holder-agent.ts`), directly implementing SRS section 2.5.3: the designated key-holder agent (`agent-D` in the demo topology) maintains an **allow-list** (`Set<agentId>`) of agents permitted to request the group key, and a **group key** (`Buffer`, 32 bytes, `crypto.randomBytes(32)` generated once at key-holder startup per group address).
- **Request/response over unicast:** a non-key-holder agent that wants to encrypt/decrypt multicast traffic sends a `kind: "system"` unicast message to the key-holder (`{ action: "REQUEST_GROUP_KEY", groupAddress }`); the key-holder checks the allow-list and responds with the key (base64) over the same secured unicast channel (itself using FR5's encryption — the key request/response is always encrypted, non-negotiable, hardcode `encrypted: true` for this specific message kind regardless of the general opt-in/out toggle, since sending a key in plaintext would be an obvious own-goal worth explicitly avoiding and worth a one-line note in `ASSUMPTIONS.md`).
- **No rotation on leave — as flagged in Part 1:** `group-membership-manager.ts`'s `leave()` method must NOT trigger any key invalidation or re-issuance. Add the same kind of loud comment as §5.6:
  ```typescript
  // AI ASSUMPTION (Part 1, row "Multicast encryption", classified "Partly SRS
  // supported"): the key-holder hands out the same static group key to every
  // allow-listed member and never rotates or revokes it when a member leaves.
  // This is a deliberate simplification, not an oversight — flagged as such.
  ```
- **GUI action:** `security/page.tsx` — shows the key-holder's current allow-list per group, a "Request Group Key" button per agent (with success/denied feedback), and an encrypted-multicast composer that reuses `multicast/page.tsx`'s send flow but requires a successfully retrieved key first (button disabled otherwise, with a tooltip explaining why).

### 5.8 Conversation Architecture (FR7 — `CONVERSATION_ARCHITECTURE`, req. 3.2.5.1, 3.2.5.2)

- **Shared transport, differing control logic** — exactly the Part 1 design decision ("both architectures can share the same underlying message transport layer, and only the conversation control logic sitting on top of it differs"). Concretely:
  - `architecture/agent-controlled.ts`: exposes a single `Agent` class method `handleIncoming(envelope)` that itself contains all conversation-state logic (a switch/state-machine directly inside the agent object) — "the agent itself controls the conversation."
  - `architecture/component-controlled.ts`: exposes a `ConversationComponent` interface plus a `ConversationRouter` that the agent delegates to — multiple pluggable `ConversationComponent` instances (e.g., `PingComponent`, `TaskBidComponent`, `JoinLeaveComponent`) each own a slice of conversation logic, and the agent's job is reduced to routing `DecryptedPayload.kind` to the right component — "the agent's components control the conversation."
  - Both variants sit **behind the same interface** (`ConversationHandler`) so `main.ts` picks one at startup based on a per-agent config flag (`architectureMode: "agent-controlled" | "component-controlled"`), and the transports underneath (§5.1–5.4) are completely unaware of which mode is active — proving the shared-transport design decision in the code structure itself, not just in prose.
- **GUI action:** `architecture/page.tsx` → `ArchitectureSwitch.tsx` — a per-agent radio toggle; switching it live restarts only that agent's conversation-handling layer (not its sockets/connections), and the message log visibly shows a `"[architecture switched to component-controlled]"` marker so a demo/viva can point at the exact moment of the switch and the identical transport-level behavior before and after.

### 5.9 Compatibility with agentMom 1.2 (NFR8 — `COMPAT_1_2`)

- Since no real "agentMom 1.2" codebase is available to us, `legacy/agentmom-1_2-adapter.ts` implements a **minimal mock legacy interface** representing what section 3.2.6.1 asks us not to break — expose the *original* (pre-this-project) public surface as literally as we can infer from the SRS's own 2.2 "Product Functions" (which describes agentMom 1.2's baseline capabilities: basic agent messaging, before broadcast/multicast/security were added):
  ```typescript
  // Legacy 1.2 surface — DO NOT MODIFY THIS INTERFACE. New features are added
  // ALONGSIDE it (new methods, new files), never by changing these signatures
  // or their behavior. This literally encodes the Part 1 "Design decision":
  // "existing agentMom 1.2 public interfaces are left unchanged, and new
  // features are added alongside them rather than modifying existing methods."
  export interface AgentMom1_2 {
    sendMessage(toAgentId: string, body: string): Promise<void>; // legacy unicast-only, no encryption param
    onMessage(handler: (fromAgentId: string, body: string) => void): void;
  }
  ```
  Implement this as a thin wrapper *on top of* the new `UNICAST` transport (calls into `unicast-transport.ts` with `encrypted: false` hardcoded, since 1.2 predates FR5) — proving compatibility isn't just asserted, it's structurally guaranteed by construction (the legacy interface has no code path that could be broken by the new features, because it's a strict subset wrapper).
- **GUI action:** `compatibility/page.tsx` — a small "Legacy Mode" panel that sends a message using *only* the `AgentMom1_2` interface (bypassing every new-feature UI) and shows it succeeding identically whether or not any new-feature toggles (encryption, multicast, broadcast) are active elsewhere in the running system at that moment — this is your literal, demoable NFR8 evidence.

---

## 6. Control-Plane API Contract

Base URL: `http://localhost:4000/api`. All responses are JSON. All error responses use `{ error: { code: string, message: string } }`.

### 6.1 Agents

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/agents` | — | `Agent[]` (id, role, status, ports, architectureMode, memberships[]) | Live snapshot |
| POST | `/agents` | `{ agentId, role, unicastPort, multicastPort, broadcastPort, architectureMode }` | `Agent` | Spawns a new child process |
| DELETE | `/agents/:agentId` | — | `204` | Kills the child process (used to demo agent failure per SRS Fig. 1 narrative) |
| PATCH | `/agents/:agentId/architecture` | `{ architectureMode }` | `Agent` | FR7 live switch |

### 6.2 Messaging

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/messages/unicast` | `{ senderId, recipientId, body, encrypted }` | `{ envelopeId }` |
| POST | `/messages/multicast` | `{ senderId, groupAddress, port, body, ttl, encrypted }` | `{ envelopeId }` |
| POST | `/messages/broadcast` | `{ senderId, port, body }` | `{ envelopeId }` |
| GET | `/messages/log` | query: `agentId?`, `mode?`, `since?` | `MessageLogEntry[]` |

### 6.3 Groups

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/groups/:groupAddress/join` | `{ agentId }` | `{ state: "MEMBER" }` |
| POST | `/groups/:groupAddress/leave` | `{ agentId }` | `{ state: "NOT_MEMBER" }` |
| GET | `/groups/:groupAddress/members` | — | `{ members: string[] }` |

### 6.4 Keys

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/keys/request` | `{ requestingAgentId, groupAddress }` | `{ granted: boolean, key?: string }` |
| GET | `/keys/:groupAddress/allowlist` | — | `{ allowlist: string[] }` |

### 6.5 Admin (NFR demo controls)

| Method | Path | Body | Response | Maps to |
|---|---|---|---|---|
| PATCH | `/admin/reliability` | `{ dropRate: number }` | `{ dropRate }` | NFR9 |
| PATCH | `/admin/broadcast-permission` | `{ simulateDenied: boolean }` | `{ simulateDenied }` | FR4 unsupported-assumption demo |
| PATCH | `/admin/default-ttl` | `{ defaultTtl: number }` | `{ defaultTtl }` | FR3 unsupported-assumption demo |

### 6.6 WebSocket (`ws://localhost:4000/live`)

Server pushes JSON events of shape `{ type: string, payload: unknown, ts: number }`. Event types: `AGENT_SPAWNED`, `AGENT_KILLED`, `AGENT_STATUS`, `MESSAGE_SENT`, `MESSAGE_RECEIVED`, `MESSAGE_DROPPED_MEMBERSHIP`, `MESSAGE_DROPPED_SIMULATED`, `MESSAGE_DROPPED_TTL_EXPIRED`, `DECRYPTION_FAILED`, `BROADCAST_PERMISSION_DENIED`, `SEQUENCE_ANOMALY`, `ARCHITECTURE_SWITCHED`, `GROUP_KEY_GRANTED`, `GROUP_KEY_DENIED`.

**Why every drop/failure/anomaly gets its own explicit event type instead of a generic "error" event:** Part 3 of the assignment needs at least 2 boundary cases, 2 invalid/error cases, and 2 genuinely FAILED/BLOCKED cases — having named, distinguishable events for each failure mode means the test-case table in Part 3 can point directly at a specific WebSocket event as its "Evidence" column entry, instead of having to reconstruct what happened from a generic log line.

---

## 7. GUI Requirements — Success/Error Feedback (per Part 2 rubric)

The rubric explicitly calls out: *"The GUI must... display observable success/error feedback. Visual polish is secondary to correct, testable behaviour."* Concretely, every page must implement, at minimum, a 3-state `StatusBadge`:

- **gray/pending** — action submitted, awaiting server/WebSocket confirmation
- **green/success** — confirmed delivered / joined / decrypted / switched, etc.
- **red/failure** — confirmed failed, with the specific event type shown as the reason (e.g., "DECRYPTION_FAILED", "BROADCAST_PERMISSION_DENIED", "MESSAGE_DROPPED_MEMBERSHIP")

Do not use a single generic toast/alert for everything — each FR's page should show its own dedicated status area so a demo/viva can point at one screen per requirement without scrolling or hunting through a shared activity feed. A shared, chronological `MessageLog.tsx` should still exist on the dashboard for the "system-level" view, but it is supplementary, not the only feedback mechanism.

---

## 8. Build Phases (do these in order; each ends in a runnable checkpoint)

### Phase 0 — Scaffolding
- Init npm workspaces root, `packages/core`, `packages/agent`, `packages/control-plane`, `packages/web`.
- `packages/core`: implement `MessageEnvelope`, `DecryptedPayload`, framing helpers, `symmetric.ts` (AES-256-GCM encrypt/decrypt functions with unit-testable pure functions), constants file (`DEFAULT_TTL_UNSUPPORTED_ASSUMPTION`, demo topology table from §3).
- **Checkpoint:** `packages/core` builds and has passing unit tests for encrypt→decrypt round trip and frame encode→decode round trip.

### Phase 1 — Single-agent unicast, no encryption, no GUI
- Implement `agent/main.ts`, `unicast-transport.ts`, `unicast-framing.ts`, `message-ordering-buffer.ts`.
- Implement `control-plane`'s `agent-supervisor.ts` (fork/kill) and the `/agents` + `/messages/unicast` REST routes only.
- **Checkpoint:** via `curl`/Postman (no GUI yet) — spawn `agent-A` and `agent-B`, POST a unicast message A→B, confirm it arrives, confirm sequence numbering, confirm B rejects/ignores anything not addressed to it.

### Phase 2 — Multicast + membership
- Implement `multicast-transport.ts`, `group-membership-manager.ts`, TTL handling (both levels per §5.3), `/groups/*` and `/messages/multicast` routes.
- **Checkpoint:** spawn 3 agents, join 2 of them to a group, confirm the 3rd doesn't receive group traffic, confirm leave immediately stops delivery, confirm TTL-expired messages are logged and dropped.

### Phase 3 — Broadcast
- Implement `broadcast-transport.ts`, permission-denied handling, `/messages/broadcast` route, `/admin/broadcast-permission` toggle.
- **Checkpoint:** all 4 demo agents receive a single broadcast send; toggling `simulateDenied` produces a visible `BROADCAST_PERMISSION_DENIED` event instead of a crash.

### Phase 4 — Security (unicast + multicast)
- Implement `unicast-security.ts`, `multicast-security.ts`, `key-holder-agent.ts`, `key-holder-protocol.ts`, `/keys/*` routes.
- **Checkpoint:** encrypted unicast round-trips correctly and auto-decrypts; a non-allow-listed agent's key request is denied; an allow-listed agent's encrypted multicast message is only readable by agents holding the group key.

### Phase 5 — Conversation architecture
- Implement `agent-controlled.ts`, `component-controlled.ts`, `ConversationHandler` interface, `/agents/:agentId/architecture` route.
- **Checkpoint:** switch an agent's mode live mid-session without restarting its sockets; confirm identical message delivery behavior underneath.

### Phase 6 — Compatibility shim + reliability simulator
- Implement `agentmom-1_2-adapter.ts`, `best-effort-simulator.ts`, `/admin/reliability` route.
- **Checkpoint:** legacy-mode send works with every new feature simultaneously toggled on elsewhere; drop-rate dial visibly causes multicast/broadcast losses at the configured rate over a batch of test sends, while unicast sends in the same batch remain 100% delivered.

### Phase 7 — Full GUI
- Build all `web/app/*` pages and components listed in §2, wire to REST + WebSocket per §6.
- **Checkpoint:** every one of the 10 requirement rows in §0 has a dedicated, clickable, observable demo path in the GUI with visible success/error states — walk the whole list manually and confirm each one before moving on.

### Phase 8 — Freeze
- Run `scripts/freeze-baseline.sh`: creates a git tag (e.g. `baseline-v1`), commits a copy of this plan and `ASSUMPTIONS.md` as-built, and zips the full `packages/` tree into `baseline-frozen.zip` for SonarQube submission.
- **From this point on, per the assignment rules: do not modify the frozen baseline.** Any defect fixes discovered during Part 3/4 testing go into a separate branch/commit *after* the baseline evidence has been collected, and the evaluated baseline is preserved separately, exactly as the rubric requires ("Keep the baseline unchanged while collecting SonarQube and test evidence").

---

## 9. `ASSUMPTIONS.md` — Required Companion File

This file must exist at repo root and contain one entry per AI assumption already listed in the Part 1 report table, in the same order, cross-referenced to the exact file/line where it's implemented. Minimum required entries (do not add unrelated ones, do not omit any):

1. TCP-reliance for unicast ordering → `packages/agent/src/message-ordering-buffer.ts`
2. Immediate leave / drop in-flight on leave → `packages/agent/src/membership/group-membership-manager.ts`
3. Default TTL when unset → `packages/core/src/protocol/multicast-framing.ts` (`DEFAULT_TTL_UNSUPPORTED_ASSUMPTION`)
4. Broadcast assumed unrestricted on dev/test machine → `packages/agent/src/transports/broadcast-transport.ts`
5. Single shared symmetric key per unicast pair, no key-exchange protocol → `packages/core/src/crypto/symmetric.ts` + `packages/agent/src/security/unicast-security.ts`
6. Key-holder never rotates/revokes group key on leave → `packages/agent/src/key-holder/key-holder-agent.ts`
7. Shared transport layer under both conversation architectures → `packages/agent/src/architecture/*.ts`
8. Legacy 1.2 interface frozen, new features additive-only → `packages/agent/src/legacy/agentmom-1_2-adapter.ts`
9. No retry/ack for best-effort delivery → `packages/agent/src/reliability/best-effort-simulator.ts`
10. Standard/unnamed-strength symmetric algorithm (AES-256-GCM chosen without an SRS-mandated strength) → `packages/core/src/crypto/symmetric.ts`

This file is what makes Part 1's table and the actual code provably consistent with each other — a viva question like "show me where in the code this assumption lives" should always have a one-line answer via this file.

---

## 10. Explicit Non-Goals (do not build these — they are out of scope for this plan)

- No database/persistence layer (contradicts the "not a CRUD system" argument already made in Part 1).
- No user authentication/login system (not part of any selected requirement).
- No retry/acknowledgement/reliability layer on top of multicast/broadcast (contradicts NFR9's Defence/basis).
- No key-rotation, revocation, or asymmetric/PKI-based key exchange (contradicts FR5/FR6's Defence/basis as written).
- No cross-machine/real-network deployment config (Docker/k8s/cloud) — this is a localhost demo app for a course assignment and viva, not a production deployment; do not spend effort here.
- No automated end-to-end test framework build-out in this plan — Part 3B requires *manual* system-level test execution per the assignment's own text ("Automation is not expected because a system-test automation tool has not been covered"); this implementation plan's job is to make the app manually testable (clear GUI actions + visible status), not to write the test suite itself. Test case design happens after this baseline is frozen, as a separate deliverable.

---

## 11. Definition of Done for This Plan

The baseline is complete and ready to freeze (Phase 8) when, and only when:

1. All 10 rows in §0 have working, demoable code paths.
2. Every AI assumption in §9 has a loud, findable comment in the exact file it lives in.
3. Every FR/NFR has at least one dedicated GUI page or panel with visible success/red-error feedback, per §7.
4. The 4-agent demo topology from §3 boots via `scripts/spawn-demo-agents.sh` and can re-enact all four SRS use case figures (join/leave, unicast, multicast, broadcast) live in the GUI.
5. `README.md` documents exact setup/run steps (node version, `npm install`, `npm run dev-up`, how to spawn the demo topology) — this is a named submission requirement in Part 2, don't skip it.
6. `ASSUMPTIONS.md` exists and matches §9.
7. Nothing outside the 10 locked requirements in §0 has been implemented (check against §10's non-goals list before freezing).
