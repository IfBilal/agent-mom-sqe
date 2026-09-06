import { describe, expect, it } from "vitest";
import {
  decrypt,
  derivePairwiseKey,
  encrypt,
} from "../../src/index.js";

const SEED = "test-seed";

describe("COND-34 — AES-256-GCM encrypt → decrypt round-trips to the original plaintext", () => {
  it("round-trips", () => {
    const key = derivePairwiseKey("agent-A", "agent-B", SEED);
    const plaintext = JSON.stringify({ kind: "chat", body: { text: "secret" } });
    const parts = encrypt(plaintext, key);
    expect(parts.ciphertext).not.toBe(plaintext);
    expect(decrypt(parts, key)).toBe(plaintext);
  });
});

describe("COND-54 — ciphertext observed on the wire differs from the plaintext body (2.4.2)", () => {
  it("the ciphertext contains none of the plaintext substring, at any offset", () => {
    const key = derivePairwiseKey("agent-A", "agent-B", SEED);
    const secret = "TOP-SECRET-MARKER-9c3f";
    const parts = encrypt(JSON.stringify({ kind: "chat", body: { text: secret } }), key);
    const decoded = Buffer.from(parts.ciphertext, "base64").toString("latin1");
    expect(decoded).not.toContain(secret);
    expect(parts.ciphertext).not.toContain(secret);
  });
});

describe("COND-35 — a tampered authTag causes decryption to throw; no plaintext is produced (BR-17)", () => {
  it("fails closed", () => {
    const key = derivePairwiseKey("agent-A", "agent-B", SEED);
    const parts = encrypt("hello", key);
    const tampered = { ...parts, authTag: Buffer.alloc(16, 7).toString("base64") };
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("wrong key also fails closed (COND-40 unit form)", () => {
    const parts = encrypt("hello", derivePairwiseKey("agent-A", "agent-B", SEED));
    const wrong = derivePairwiseKey("agent-A", "agent-C", SEED);
    expect(() => decrypt(parts, wrong)).toThrow();
  });
});

describe("COND-36 — pairwise key derivation is order-independent: key(A,B) === key(B,A) (A5.2)", () => {
  it("order-independent", () => {
    expect(derivePairwiseKey("agent-A", "agent-B", SEED)).toEqual(
      derivePairwiseKey("agent-B", "agent-A", SEED),
    );
  });

  it("different pairs derive different keys", () => {
    expect(derivePairwiseKey("agent-A", "agent-B", SEED)).not.toEqual(
      derivePairwiseKey("agent-A", "agent-C", SEED),
    );
  });
});
