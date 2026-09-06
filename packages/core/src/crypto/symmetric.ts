import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// A5.1 / A10.1 — Design decision. AES-256-GCM: authenticated encryption in one
// primitive, no external dependency. Do NOT move to asymmetric crypto — that
// would contradict A5.2 as written.
//
// A10.2 — Supported by SRS (2.4.2 explicitly disclaims any guarantee).
// BR-24: no claim about encryption strength, key length or resistance is made
// here or anywhere. This is basic encryption only (NFR10).

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface CipherParts {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

export function encrypt(plaintext: string, key: Buffer): CipherParts {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

// BR-17 — fail closed. A failed decryption throws; no partial plaintext is
// ever returned to the caller.
export function decrypt(parts: CipherParts, key: Buffer): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(parts.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parts.authTag, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(parts.ciphertext, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}

// AI ASSUMPTION A5.2 — classified UNSUPPORTED in the Part 1 report.
// The SRS specifies no key-exchange process for unicast (2.5.3 covers multicast
// only). This deterministic pairwise derivation is a development-time stand-in,
// chosen so the demo has *a* working key without inventing a handshake the SRS
// also never asked for.
// Do NOT present this as production key management. It is the flagged gap.
export function derivePairwiseKey(agentA: string, agentB: string, seed: string): Buffer {
  const material = [agentA, agentB].sort().join("|") + seed;
  return createHash("sha256").update(material).digest(); // 32 bytes
}

export function newGroupKey(): Buffer {
  return randomBytes(32);
}
