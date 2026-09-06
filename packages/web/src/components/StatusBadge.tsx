// §11 — three-state StatusBadge:
//  pending — submitted, awaiting confirmation
//  success — confirmed, with the confirming EVENT named
//  failure — confirmed failed, with the specific EVENT TYPE as the reason
export type BadgeState = "idle" | "pending" | "success" | "failure";

const GLYPH: Record<BadgeState, string> = { idle: "•", pending: "…", success: "✓", failure: "✕" };

export function StatusBadge({ state, event, detail }: { state: BadgeState; event?: string; detail?: string }) {
  return (
    <div className={`badge ${state}`} role="status" aria-live="polite">
      <span className="dot" aria-hidden />
      <span className="state">{GLYPH[state]} {state}</span>
      {event && <code>{event}</code>}
      {detail && <span className="detail">{detail}</span>}
    </div>
  );
}
