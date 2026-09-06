// AI ASSUMPTION A3.1 — classified UNSUPPORTED in the Part 1 report.
// The SRS is silent on a default TTL when the sender sets none. This value is
// our stand-in. The name is deliberately loud: in a code review or SonarQube
// pass it must read as a flagged non-SRS-derived value, not a magic number.
export const DEFAULT_TTL_UNSUPPORTED_ASSUMPTION = 1;

// A3.3 — Design decision, implementation safety rail, NOT SRS-derived.
// Encoded envelopes above this size are rejected at send time, never fragmented.
// Never present this as an SRS requirement in report text.
export const MAX_DATAGRAM_BYTES = 60000;

// Design — BR-10. A multicast destination must lie inside 224.0.0.0/4.
export const MULTICAST_CIDR_LOW = 0xe0000000; // 224.0.0.0
export const MULTICAST_CIDR_HIGH = 0xefffffff; // 239.255.255.255

// FR3 (3.2.3.3) — the limited broadcast address. BR-12 falls back to the
// subnet-directed address of the active interface where the OS will not route it.
export const LIMITED_BROADCAST_ADDRESS = "255.255.255.255";

export const FRAME_LENGTH_PREFIX_BYTES = 4;
