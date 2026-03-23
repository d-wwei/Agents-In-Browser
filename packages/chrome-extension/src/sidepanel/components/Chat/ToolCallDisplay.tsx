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

const tcStatusColors: Record<string, { icon: string; border: string }> = {
  pending: { icon: "#3b82f6", border: "#3b82f6" },
  complete: { icon: "#6ee7b7", border: "#6ee7b7" },
  error: { icon: "#f87171", border: "#f87171" },
};

function StatusIcon({ status }: { status: ToolCallInfo["status"] }) {
  const color = tcStatusColors[status]?.icon ?? "#3b82f6";
  if (status === "pending") {
    return <Loader2 size={14} className="animate-spin" style={{ color }} />;
  }
  if (status === "complete") {
    return <CheckCircle2 size={14} style={{ color }} />;
  }
  return <XCircle size={14} style={{ color }} />;
}

export default function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const sc = tcStatusColors[toolCall.status] || tcStatusColors.pending;

  return (
    <div
      className="animate-fade-in"
      style={{
        margin: "4px 16px", borderRadius: 10, overflow: "hidden",
        background: "var(--card, #1e2538)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderLeft: `2px solid ${sc.border}`,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`Tool call: ${toolCall.tool}, status: ${toolCall.status}`}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", fontSize: 12, color: "#6b7280",
          background: "none", border: "none", outline: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <StatusIcon status={toolCall.status} />
        <span style={{ fontWeight: 500, color: "#d1d5db" }}>{toolCall.tool}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>
          {formatDuration(toolCall.startTime, toolCall.endTime)}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: "#6b7280",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms",
          }}
        />
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.18)" }}>
          <div style={{ padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Arguments
            </div>
            <pre style={{
              margin: 0, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 11, color: "#9ca3af",
              background: "#1a1d26", borderRadius: 8, padding: 8,
              overflowX: "auto", maxHeight: 192, overflowY: "auto",
            }}>
              <code>{JSON.stringify(toolCall.args, null, 2)}</code>
            </pre>
          </div>

          {(toolCall.result !== undefined || toolCall.error) && (
            <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.18)" }}>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                {toolCall.error ? "Error" : "Result"}
              </div>
              <pre style={{
                margin: 0, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 11,
                borderRadius: 8, padding: 8, overflowX: "auto", maxHeight: 192, overflowY: "auto",
                color: toolCall.error ? "#f87171" : "#9ca3af",
                background: toolCall.error ? "rgba(248,113,113,0.08)" : "#1a1d26",
              }}>
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

interface ToolCallSummaryProps {
  toolCalls: ToolCallInfo[];
}

export function ToolCallSummary({ toolCalls }: ToolCallSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  if (toolCalls.length === 0) return null;

  const stepCount = toolCalls.length;
  const hasError = toolCalls.some((t) => t.status === "error");
  const hasPending = toolCalls.some((t) => t.status === "pending");
  const statusColor = hasError ? "#f87171" : hasPending ? "#60a5fa" : "#6ee7b7";

  return (
    <div
      className="animate-fade-in"
      style={{
        margin: "4px 16px",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--card, #1e2538)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderLeft: `2px solid ${statusColor}`,
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${stepCount} steps`}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          fontSize: 12,
          background: "none",
          border: "none",
          outline: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "#d1d5db",
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {stepCount} step{stepCount > 1 ? "s" : ""}
        </span>
        <span style={{ marginLeft: 4, fontSize: 11, color: "#6b7280" }}>
          {hasError ? "contains error" : hasPending ? "in progress" : "completed"}
        </span>
        <ChevronDown
          size={12}
          style={{
            marginLeft: "auto",
            color: "#6b7280",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms",
          }}
        />
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.18)", padding: "6px 12px 10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {toolCalls.map((tc, idx) => (
              <div key={`sum-${tc.callId}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "#9ca3af",
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#d1d5db", fontWeight: 500 }}>
                    {tc.tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  {formatDuration(tc.startTime, tc.endTime)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
