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
    <div className="composer">
      <input
        type="text"
        value={body}
        placeholder={placeholder}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) onSend(body);
        }}
      />
      <button disabled={disabled} onClick={() => onSend(body)}>
        Send
      </button>
    </div>
  );
}
