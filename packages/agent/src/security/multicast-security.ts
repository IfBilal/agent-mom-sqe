import {
  decrypt,
  encrypt,
  type MessageEnvelope,
} from "@agentmom/core";
import { DecryptionFailed } from "./unicast-security.js";

// FR6 — §9.6. Encrypt/decrypt multicast using a group key obtained from the
// key-holder agent (BR-18). Keys are stored per group once granted.

export class MulticastSecurity {
  private readonly groupKeys = new Map<string, Buffer>();

  hasKey(groupAddress: string): boolean {
    return this.groupKeys.has(groupAddress);
  }

  storeKey(groupAddress: string, keyBase64: string): void {
    this.groupKeys.set(groupAddress, Buffer.from(keyBase64, "base64"));
  }

  encryptOutbound(env: MessageEnvelope): MessageEnvelope {
    const key = this.groupKeys.get(env.groupAddress ?? "");
    if (!key) throw new Error(`no group key held for ${env.groupAddress} (FR6)`);
    const parts = encrypt(env.payload, key);
    return { ...env, encrypted: true, payload: parts.ciphertext, iv: parts.iv, authTag: parts.authTag };
  }

  // BR-17 — fail closed for non-key-holders: DECRYPTION_FAILED, deliver nothing.
  decryptInbound(env: MessageEnvelope): string {
    if (!env.encrypted) return env.payload;
    const key = this.groupKeys.get(env.groupAddress ?? "");
    if (!key) throw new DecryptionFailed(`no group key for ${env.groupAddress}`);
    try {
      return decrypt({ ciphertext: env.payload, iv: env.iv!, authTag: env.authTag! }, key);
    } catch (err) {
      throw new DecryptionFailed((err as Error).message);
    }
  }
}
