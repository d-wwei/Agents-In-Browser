import { useAgentStore } from "../store/agentStore";
import { List, Clock, Settings } from "lucide-react";
import AgentSelector from "./AgentSwitcher/AgentSelector";
import type { AgentConnectionState } from "@anthropic-ai/acp-browser-shared";

interface TopBarProps {
  onOpenSettings: () => void;
  onOpenSessions: () => void;
  onOpenHistory: () => void;
  sendWsMessage: (type: string, payload: Record<string, unknown>) => boolean;
}

const CONNECTION_STATUS: Record<
  AgentConnectionState,
  { label: string; dotClass: string }
> = {
  connected: { label: "Connected", dotClass: "bg-accent glow-accent" },
  starting: { label: "Starting...", dotClass: "bg-warning animate-pulse" },
  disconnected: { label: "Disconnected", dotClass: "bg-text-muted" },
  error: { label: "Error", dotClass: "bg-error" },
};

export default function TopBar({
  onOpenSettings,
  onOpenSessions,
  onOpenHistory,
  sendWsMessage,
}: TopBarProps) {
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const agents = useAgentStore((s) => s.agents);
  const preflight = useAgentStore((s) => s.preflight);
  const currentAgent = agents.find((a) => a.id === currentAgentId);
  const preflightActive = !!preflight && preflight.agentId !== currentAgentId;
  const connectionState = currentAgent?.connectionState ?? "disconnected";
  const status = preflightActive
    ? preflight.status === "checking"
      ? { label: "Checking...", dotClass: "bg-warning animate-pulse" }
      : preflight.status === "installing"
        ? { label: "Installing...", dotClass: "bg-warning animate-pulse" }
        : preflight.status === "prompt_install"
          ? { label: "Install Required", dotClass: "bg-warning" }
          : { label: "Unavailable", dotClass: "bg-error" }
    : CONNECTION_STATUS[connectionState];

  return (
    <div
      className="flex items-center justify-between px-3 shrink-0"
      style={{
        height: 48,
        background: "#1e2640",
        borderBottom: "1px solid rgba(255,255,255,0.22)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center min-w-0 flex-1">
        <AgentSelector sendWsMessage={sendWsMessage} />
      </div>

      <div className="flex items-center" style={{ gap: 4 }}>
        <div className="flex items-center" style={{ gap: 4 }}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${status.dotClass}`} />
          <span className="text-[11px] text-text-secondary whitespace-nowrap">
            {status.label}
          </span>
        </div>
        <button
          onClick={onOpenSessions}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          aria-label="View sessions"
        >
          <List size={18} aria-hidden="true" />
        </button>
        <button
          onClick={onOpenHistory}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          aria-label="View task history"
        >
          <Clock size={18} aria-hidden="true" />
        </button>
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          aria-label="Open settings"
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
