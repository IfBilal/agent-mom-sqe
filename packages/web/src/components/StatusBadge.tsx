// §11 — every page implements a three-state StatusBadge:
//  grey/pending  — submitted, awaiting confirmation
//  green/success — confirmed, with the confirming EVENT named
//  red/failure   — confirmed failed, with the specific EVENT TYPE as the reason
export type BadgeState = "idle" | "pending" | "success" | "failure";

const COLOR: Record<BadgeState, string> = {
  idle: "#8a8a8a",
  pending: "#b58900",
  success: "#2e7d32",
  failure: "#c62828",
};

export function StatusBadge({
  state,
  event,
  detail,
}: {
  state: BadgeState;
  event?: string;
  detail?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
      <span
        style={{
          display: "inline-block",
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: COLOR[state],
        }}
      />
      <strong style={{ textTransform: "uppercase", fontSize: 12 }}>{state}</strong>
      {event && <code style={{ fontSize: 12 }}>{event}</code>}
      {detail && <span style={{ fontSize: 12, color: "#555" }}>{detail}</span>}
    </div>
  );
}
