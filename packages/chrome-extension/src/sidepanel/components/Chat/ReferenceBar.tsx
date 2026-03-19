import { Image, Code, FileText, AlignLeft, X } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { MAX_REFERENCES } from "@anthropic-ai/acp-browser-shared";

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
    <div className="flex items-center gap-1.5 px-2 py-1.5 glass-strong border-b border-glass-border overflow-x-auto">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {references.slice(0, MAX_REFERENCES).map((ref) => (
          <div
            key={ref.id}
            className="flex items-center gap-1 bg-bg-tertiary/60 rounded-lg px-2 py-0.5 max-w-[160px] shrink-0 group"
          >
            <span className="text-text-muted shrink-0">
              <SourceIcon type={ref.type} />
            </span>

            {ref.type === "image" ? (
              <img
                src={ref.content}
                alt="attachment"
                className="w-5 h-5 rounded object-cover"
              />
            ) : (
              <span className="text-[11px] text-text-secondary truncate">
                {ref.preview}
              </span>
            )}

            <button
              onClick={() => removeReference(ref.id)}
              className="text-text-muted hover:text-text-primary ml-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none rounded"
              aria-label={`Remove reference: ${ref.preview || ref.type}`}
            >
              <X size={10} aria-hidden="true" />
            </button>
          </div>
        ))}

        {references.length >= MAX_REFERENCES && (
          <span className="text-[10px] text-text-muted shrink-0">
            Max {MAX_REFERENCES}
          </span>
        )}
      </div>

      {references.length > 1 && (
        <button
          onClick={clearReferences}
          className="text-[10px] text-text-muted hover:text-text-primary shrink-0 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none rounded"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
