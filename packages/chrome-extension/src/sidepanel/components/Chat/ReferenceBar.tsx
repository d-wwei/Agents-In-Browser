import { Image, Code, FileText, AlignLeft, X } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { MAX_REFERENCES } from "@anthropic-ai/agents-in-browser-shared";

function SourceIcon({ type }: { type: string }) {
  const props = { size: 12, "aria-hidden": true as const };
  switch (type) {
    case "image":
      return <Image {...props} />;
    case "element":
      return <Code {...props} />;
    case "page":
      return <FileText {...props} />;
    default:
      return <AlignLeft {...props} />;
  }
}

export default function ReferenceBar() {
  const references = useChatStore((s) => s.references);
  const removeReference = useChatStore((s) => s.removeReference);
  const clearReferences = useChatStore((s) => s.clearReferences);

  if (references.length === 0) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
      background: "var(--card, #1e2538)", borderTop: "1px solid rgba(255,255,255,0.18)",
      overflowX: "auto",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        {references.slice(0, MAX_REFERENCES).map((ref) => (
          <div
            key={ref.id}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "#1a1d26", borderRadius: 8, padding: "2px 8px",
              maxWidth: 160, flexShrink: 0,
            }}
          >
            <span style={{ color: "#6b7280", flexShrink: 0, display: "flex" }}>
              <SourceIcon type={ref.type} />
            </span>

            {ref.type === "image" ? (
              <img
                src={ref.content}
                alt="attachment"
                style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }}
              />
            ) : (
              <span style={{
                fontSize: 11, color: "#6b7280",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {ref.preview}
              </span>
            )}

            <button
              onClick={() => removeReference(ref.id)}
              aria-label={`Remove reference: ${ref.preview || ref.type}`}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#6b7280", flexShrink: 0, display: "flex",
                marginLeft: 2, padding: 0,
              }}
            >
              <X size={10} />
            </button>
          </div>
        ))}

        {references.length >= MAX_REFERENCES && (
          <span style={{ fontSize: 10, color: "#6b7280", flexShrink: 0 }}>
            Max {MAX_REFERENCES}
          </span>
        )}
      </div>

      {references.length > 1 && (
        <button
          onClick={clearReferences}
          style={{
            fontSize: 10, color: "#6b7280", background: "none", border: "none",
            cursor: "pointer", flexShrink: 0, padding: 0,
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
