// BR-14 — encryption is a per-message decision made by the SENDER, not a global
// setting. This toggle is wired straight to MessageEnvelope.encrypted.
export function EncryptionToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      encrypt this message (per-message — BR-14)
    </label>
  );
}
