import { useChatStore } from "../../store/chatStore";
import { MAX_REFERENCES } from "@anthropic-ai/acp-browser-shared";

function SourceIcon({ type }: { type: string }) {
  switch (type) {
    case "image":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="1" y="1" width="10" height="10" rx="1" />
          <circle cx="4" cy="4" r="1" />
          <path d="M11 8L8 5L2 11" />
        </svg>
      );
    case "element":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M3 1L1 6L3 11" />
          <path d="M9 1L11 6L9 11" />
          <line x1="7" y1="2" x2="5" y2="10" />
        </svg>
      );
    case "page":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4L7 1Z" />
          <path d="M7 1v3h3" />
        </svg>
      );
    default:
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M4 3h4M4 6h4M4 9h2" />
        </svg>
      );
  }
}

export default function ReferenceBar() {
  const references = useChatStore((s) => s.references);
  const removeReference = useChatStore((s) => s.removeReference);
  const clearReferences = useChatStore((s) => s.clearReferences);

  if (references.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-bg-secondary border-b border-border overflow-x-auto">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {references.slice(0, MAX_REFERENCES).map((ref) => (
          <div
            key={ref.id}
            className="flex items-center gap-1 bg-bg-tertiary rounded px-2 py-0.5 max-w-[160px] shrink-0 group"
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
              className="text-text-muted hover:text-text-primary ml-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
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
          className="text-[10px] text-text-muted hover:text-text-primary shrink-0 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
