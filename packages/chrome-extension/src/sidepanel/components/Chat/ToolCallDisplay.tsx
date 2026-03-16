import { useState } from "react";
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
    return (
      <svg
        className="w-3.5 h-3.5 text-accent animate-spin"
        viewBox="0 0 16 16"
        fill="none"
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="28"
          strokeDashoffset="8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (status === "complete") {
    return (
      <svg
        className="w-3.5 h-3.5 text-success"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3.5 8 6.5 11 12.5 5" />
      </svg>
    );
  }
  return (
    <svg
      className="w-3.5 h-3.5 text-error"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

export default function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  const borderColor =
    toolCall.status === "pending"
      ? "border-accent/40"
      : toolCall.status === "complete"
        ? "border-success/40"
        : "border-error/40";

  return (
    <div
      className={`mx-8 my-1 rounded border ${borderColor} bg-bg-secondary overflow-hidden animate-fade-in`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-hover transition-colors"
      >
        <StatusIcon status={toolCall.status} />
        <span className="font-medium text-text-primary">{toolCall.tool}</span>
        <span className="text-text-muted ml-auto text-[11px]">
          {formatDuration(toolCall.startTime, toolCall.endTime)}
        </span>
        <svg
          className={`w-3 h-3 text-text-muted transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {/* Arguments */}
          <div className="px-3 py-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
              Arguments
            </div>
            <pre className="text-[11px] text-text-secondary bg-bg-primary rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
              <code>{JSON.stringify(toolCall.args, null, 2)}</code>
            </pre>
          </div>

          {/* Result */}
          {(toolCall.result !== undefined || toolCall.error) && (
            <div className="px-3 py-2 border-t border-border">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {toolCall.error ? "Error" : "Result"}
              </div>
              <pre
                className={`text-[11px] rounded p-2 overflow-x-auto max-h-48 overflow-y-auto ${
                  toolCall.error
                    ? "text-error bg-error/10"
                    : "text-text-secondary bg-bg-primary"
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
