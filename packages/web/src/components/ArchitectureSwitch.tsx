// FR7 — per-agent mode radio. A7.2: switching replaces only the handler,
// never the sockets. The log emits ARCHITECTURE_SWITCHED at the exact moment.
export function ArchitectureSwitch({
  agentId,
  mode,
  onSwitch,
}: {
  agentId: string;
  mode: string;
  onSwitch: (agentId: string, mode: string) => void;
}) {
  return (
    <div className="row tight" style={{ margin: "6px 0" }}>
      <strong style={{ minWidth: 72 }}>{agentId}</strong>
      {(["agent-controlled", "component-controlled"] as const).map((m) => (
        <label key={m}>
          <input
            type="radio"
            name={`arch-${agentId}`}
            checked={mode === m}
            onChange={() => onSwitch(agentId, m)}
          />
          {m}
        </label>
      ))}
    </div>
  );
}
