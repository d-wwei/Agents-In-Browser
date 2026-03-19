import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, ChevronDown } from "lucide-react";
import type { ToolCallInfo } from "../../store/chatStore";

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime || Date.now();
  const ms = end - startTime;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusIcon({ status }: { status: ToolCallInfo["status"] }) {
  if (status === "pending") {
    return <Loader2 size={14} className="text-accent animate-spin" aria-hidden="true" />;
  }
  if (status === "complete") {
    return <CheckCircle2 size={14} className="text-success" aria-hidden="true" />;
  }
  return <XCircle size={14} className="text-error" aria-hidden="true" />;
}

export default function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  const borderColor =
    toolCall.status === "pending"
      ? "border-accent/20"
      : toolCall.status === "complete"
        ? "border-success/20"
        : "border-error/20";

  return (
    <div
      className={`mx-8 my-1 rounded-lg glass ${borderColor} overflow-hidden animate-fade-in`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-hover/50 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-expanded={expanded}
        aria-label={`Tool call: ${toolCall.tool}, status: ${toolCall.status}`}
      >
        <StatusIcon status={toolCall.status} />
        <span className="font-medium text-text-primary">{toolCall.tool}</span>
        <span className="text-text-muted ml-auto text-[11px]">
          {formatDuration(toolCall.startTime, toolCall.endTime)}
        </span>
        <ChevronDown
          size={12}
          className={`text-text-muted transition-transform duration-150 ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="border-t border-glass-border">
          <div className="px-3 py-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
              Arguments
            </div>
            <pre className="text-[11px] text-text-secondary bg-bg-primary/60 rounded-lg p-2 overflow-x-auto max-h-48 overflow-y-auto">
              <code>{JSON.stringify(toolCall.args, null, 2)}</code>
            </pre>
          </div>

          {(toolCall.result !== undefined || toolCall.error) && (
            <div className="px-3 py-2 border-t border-glass-border">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {toolCall.error ? "Error" : "Result"}
              </div>
              <pre
                className={`text-[11px] rounded-lg p-2 overflow-x-auto max-h-48 overflow-y-auto ${
                  toolCall.error
                    ? "text-error bg-error/10"
                    : "text-text-secondary bg-bg-primary/60"
                }`}
              >
                <code>
                  {toolCall.error ||
                    (typeof toolCall.result === "string"
                      ? toolCall.result
                      : JSON.stringify(toolCall.result, null, 2))}
                </code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
