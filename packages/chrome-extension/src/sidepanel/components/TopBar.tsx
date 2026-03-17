import { useAgentStore } from "../store/agentStore";
import AgentSelector from "./AgentSwitcher/AgentSelector";
import type { AgentConnectionState } from "@anthropic-ai/acp-browser-shared";

interface TopBarProps {
  onOpenSettings: () => void;
  onOpenSessions: () => void;
  onOpenHistory: () => void;
  sendWsMessage: (type: string, payload: Record<string, unknown>) => void;
}

const CONNECTION_STATUS: Record<
  AgentConnectionState,
  { label: string; color: string }
> = {
  connected: { label: "Connected", color: "bg-success" },
  starting: { label: "Starting...", color: "bg-warning" },
  disconnected: { label: "Disconnected", color: "bg-text-muted" },
  error: { label: "Error", color: "bg-error" },
};

export default function TopBar({
  onOpenSettings,
  onOpenSessions,
  onOpenHistory,
  sendWsMessage,
}: TopBarProps) {
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const agents = useAgentStore((s) => s.agents);
  const currentAgent = agents.find((a) => a.id === currentAgentId);
  const connectionState = currentAgent?.connectionState ?? "disconnected";
  const status = CONNECTION_STATUS[connectionState];

  return (
    <div
      className="flex items-center justify-between px-3 bg-bg-secondary border-b border-border shrink-0"
      style={{ height: 48 }}
    >
      {/* Left: Agent selector */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <AgentSelector sendWsMessage={sendWsMessage} />
      </div>

      {/* Center: Connection status */}
      <div className="flex items-center gap-1.5 px-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${status.color}`} />
        <span className="text-[11px] text-text-secondary whitespace-nowrap">
          {status.label}
        </span>
      </div>

      {/* Right: Session list + Settings */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenSessions}
          className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="Sessions"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="4" x2="13" y2="4" />
            <line x1="3" y1="8" x2="13" y2="8" />
            <line x1="3" y1="12" x2="13" y2="12" />
          </svg>
        </button>
        <button
          onClick={onOpenHistory}
          className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="Task history"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3.5A4.5 4.5 0 1 0 12.5 8" />
            <polyline points="8 5.5 8 8.2 10 9.4" />
            <polyline points="11.5 2.8 12.8 2.8 12.8 4.1" />
          </svg>
        </button>
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="Settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="2.5" />
            <path d="M13.5 8a5.5 5.5 0 0 0-.08-.88l1.36-1.06-.68-1.18-1.62.54a5.5 5.5 0 0 0-1.52-.88L10.5 3h-1.36l-.46 1.54a5.5 5.5 0 0 0-1.52.88l-1.62-.54-.68 1.18 1.36 1.06A5.5 5.5 0 0 0 6.14 8c0 .3.03.6.08.88l-1.36 1.06.68 1.18 1.62-.54c.44.36.96.66 1.52.88l.46 1.54h1.36l.46-1.54c.56-.22 1.08-.52 1.52-.88l1.62.54.68-1.18-1.36-1.06c.05-.28.08-.58.08-.88z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
