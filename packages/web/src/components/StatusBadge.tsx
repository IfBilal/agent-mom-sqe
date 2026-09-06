// §11 — every page implements a three-state StatusBadge:
//  grey/pending  — submitted, awaiting confirmation
//  green/success — confirmed, with the confirming EVENT named
//  red/failure   — confirmed failed, with the specific EVENT TYPE as the reason
export type BadgeState = "idle" | "pending" | "success" | "failure";

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
    <div className={`badge ${state}`} role="status" aria-live="polite">
      <span className="dot" aria-hidden />
      <span className="state">{state}</span>
      {event && <code>{event}</code>}
      {detail && <span className="detail">{detail}</span>}
    </div>
  );
}
