import {
  MULTICAST_CIDR_HIGH,
  MULTICAST_CIDR_LOW,
} from "../constants.js";
import type { MessageEnvelope } from "../types/message.js";

// §8 invariants, enforced here. BR-16 lives here too.

export type ValidationCode =
  | "OK"
  | "MISSING_RECIPIENT"
  | "MISSING_GROUP_ADDRESS"
  | "TTL_ON_NON_MULTICAST"
  | "MALFORMED_CRYPTO_FIELDS" // BR-16 — TC-12 target
  | "STRAY_CRYPTO_FIELDS"
  | "GROUP_ADDRESS_OUT_OF_RANGE"; // BR-10 — TC-09 target

export interface ValidationResult {
  code: ValidationCode;
  ok: boolean;
  message?: string;
}

const OK: ValidationResult = { code: "OK", ok: true };

function fail(code: ValidationCode, message: string): ValidationResult {
  return { code, ok: false, message };
}

export function ipv4ToInt(addr: string): number | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const octet = Number(p);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

// BR-10 — a multicast destination must lie inside 224.0.0.0/4.
export function isMulticastAddress(addr: string): boolean {
  const n = ipv4ToInt(addr);
  return n !== null && n >= MULTICAST_CIDR_LOW && n <= MULTICAST_CIDR_HIGH;
}

export function validateEnvelope(env: MessageEnvelope): ValidationResult {
  // Invariant 4 / BR-16 — encrypted:true with either crypto field missing is
  // malformed. Log, drop, do NOT attempt decryption.
  if (env.encrypted) {
    if (!env.iv || !env.authTag) {
      return fail(
        "MALFORMED_CRYPTO_FIELDS",
        "encrypted=true but iv or authTag is missing (BR-16)",
      );
    }
  } else if (env.iv !== undefined || env.authTag !== undefined) {
    // Invariant 3 — encrypted:false ⟹ iv/authTag undefined, not empty strings.
    return fail(
      "STRAY_CRYPTO_FIELDS",
      "encrypted=false but iv/authTag present (§8 invariant 3)",
    );
  }

  if (env.mode === "unicast" && !env.recipientId) {
    return fail("MISSING_RECIPIENT", "unicast envelope has no recipientId (BR-01)");
  }

  if (env.mode === "multicast") {
    if (!env.groupAddress) {
      return fail("MISSING_GROUP_ADDRESS", "multicast envelope has no groupAddress");
    }
    if (!isMulticastAddress(env.groupAddress)) {
      // Invariant 5 / BR-10 — TC-09 target.
      return fail(
        "GROUP_ADDRESS_OUT_OF_RANGE",
        `${env.groupAddress} is outside 224.0.0.0/4 (BR-10)`,
      );
    }
  }

  // Invariant 2 — ttl appears on multicast envelopes only.
  if (env.mode !== "multicast" && env.ttl !== undefined) {
    return fail(
      "TTL_ON_NON_MULTICAST",
      "ttl present on a non-multicast envelope (§8 invariant 2)",
    );
  }

  return OK;
}
