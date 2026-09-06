import {
  decrypt,
  derivePairwiseKey,
  encrypt,
  validateEnvelope,
  type MessageEnvelope,
} from "@agentmom/core";

// FR5 — §9.5. BR-14..17.
//
// AI ASSUMPTION A5.2 — classified UNSUPPORTED in the Part 1 report.
// The SRS specifies no key-exchange process for unicast (2.5.3 covers multicast
// only). This deterministic pairwise derivation is a development-time stand-in,
// chosen so the demo has *a* working key without inventing a handshake the SRS
// also never asked for.
// Do NOT present this as production key management. It is the flagged gap.

export class DecryptionFailed extends Error {
  constructor(reason: string) {
    super(`DECRYPTION_FAILED: ${reason}`);
    this.name = "DecryptionFailed";
  }
}

export class MalformedEnvelope extends Error {
  constructor(reason: string) {
    super(`MESSAGE_MALFORMED: ${reason}`);
    this.name = "MalformedEnvelope";
  }
}

export class UnicastSecurity {
  constructor(
    private readonly agentId: string,
    private readonly seed: string,
  ) {}

  private keyFor(otherAgentId: string): Buffer {
    return derivePairwiseKey(this.agentId, otherAgentId, this.seed);
  }

  // BR-14 — encryption is a per-message decision by the sender, not a global
  // setting. Called only when the composer's per-message toggle is on.
  encryptOutbound(env: MessageEnvelope): MessageEnvelope {
    if (!env.recipientId) throw new Error("cannot encrypt unicast without recipientId");
    const parts = encrypt(env.payload, this.keyFor(env.recipientId));
    return {
      ...env,
      encrypted: true,
      payload: parts.ciphertext,
      iv: parts.iv,
      authTag: parts.authTag,
    };
  }

  // BR-15 — auto-decrypt: the receiver checks `encrypted`, looks up the pairwise
  // key, decrypts before dispatch. No user action.
  // BR-17 — fail closed: on failure raise DECRYPTION_FAILED and deliver nothing.
  decryptInbound(env: MessageEnvelope): string {
    if (!env.encrypted) return env.payload;

    // BR-16 — encrypted:true with iv/authTag missing is malformed: dropped,
    // NO decryption attempted.
    const validation = validateEnvelope(env);
    if (validation.code === "MALFORMED_CRYPTO_FIELDS") {
      throw new MalformedEnvelope(validation.message ?? "missing iv/authTag");
    }

    try {
      return decrypt(
        { ciphertext: env.payload, iv: env.iv!, authTag: env.authTag! },
        this.keyFor(env.senderId),
      );
    } catch (err) {
      throw new DecryptionFailed((err as Error).message);
    }
  }
}
