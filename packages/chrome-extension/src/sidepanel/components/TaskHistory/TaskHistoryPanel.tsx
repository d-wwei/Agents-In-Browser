import { useMemo } from "react";
import { CornerUpLeft } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import TaskStepList from "./TaskStepList";

interface TaskHistoryPanelProps {
  onClose: () => void;
}

export default function TaskHistoryPanel({ onClose }: TaskHistoryPanelProps) {
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const taskSteps = useChatStore((s) => s.taskSteps);

  const steps = useMemo(
    () => taskSteps.filter((s) => s.sessionId === currentSessionId).sort((a, b) => a.stepIndex - b.stepIndex),
    [taskSteps, currentSessionId],
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--background, #0f1117)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 16px", height: 48, flexShrink: 0,
        background: "var(--card, #1e2538)",
        borderBottom: "1px solid rgba(255,255,255,0.18)",
      }}>
        <button
          onClick={onClose}
          aria-label="Back"
          style={{
            width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 6, border: "none", background: "none", cursor: "pointer",
            color: "#9ca3af",
          }}
        >
          <CornerUpLeft size={16} />
        </button>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#d1d5db" }}>
          Task History
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {currentSessionId == null ? (
          <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#6b7280" }}>
            No active session.
          </p>
        ) : (
          <TaskStepList steps={steps} />
        )}
      </div>
    </div>
  );
}
