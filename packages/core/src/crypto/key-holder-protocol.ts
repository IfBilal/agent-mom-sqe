// FR6 key-holder wire protocol — §9.6.
// BR-19 / A6.3 (Design decision): key request and key response messages are
// ALWAYS encrypted, hardcoded, overriding the BR-14 per-message opt-out.
// Sending a key in plaintext would be an obvious own-goal.

export interface KeyRequest {
  action: "REQUEST_GROUP_KEY";
  groupAddress: string;
  requestingAgentId: string;
}

export interface KeyResponseGranted {
  action: "GROUP_KEY_GRANTED";
  groupAddress: string;
  groupKeyBase64: string;
}

export interface KeyResponseDenied {
  action: "GROUP_KEY_DENIED";
  groupAddress: string;
  reason: string;
}

export type KeyResponse = KeyResponseGranted | KeyResponseDenied;

export function isKeyRequest(body: unknown): body is KeyRequest {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { action?: unknown }).action === "REQUEST_GROUP_KEY"
  );
}
