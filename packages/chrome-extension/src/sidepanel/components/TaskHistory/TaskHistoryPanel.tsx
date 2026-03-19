import { useMemo } from "react";
import { X } from "lucide-react";
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
    <div className="h-full flex flex-col bg-bg-primary">
      <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
        <h2 className="text-[14px] font-semibold text-text-primary">Task History</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          aria-label="Close task history"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {currentSessionId == null ? (
          <p className="text-[12px] text-text-muted">No active session.</p>
        ) : (
          <TaskStepList steps={steps} />
        )}
      </div>
    </div>
  );
}
