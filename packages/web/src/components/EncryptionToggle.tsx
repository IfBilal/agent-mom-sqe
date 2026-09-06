// BR-14 — encryption is a per-message decision made by the SENDER, not a global
// setting. This toggle is wired straight to MessageEnvelope.encrypted.
export function EncryptionToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      encrypt this message <span className="muted">(per-message — BR-14)</span>
    </label>
  );
}
