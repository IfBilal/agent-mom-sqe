import { useState } from "react";

export function MessageComposer({
  onSend,
  disabled,
  placeholder = "message body",
}: {
  onSend: (body: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [body, setBody] = useState("hello from the harness");
  return (
    <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
      <input
        style={{ flex: 1 }}
        value={body}
        placeholder={placeholder}
        onChange={(e) => setBody(e.target.value)}
      />
      <button disabled={disabled} onClick={() => onSend(body)}>
        Send
      </button>
    </div>
  );
}
