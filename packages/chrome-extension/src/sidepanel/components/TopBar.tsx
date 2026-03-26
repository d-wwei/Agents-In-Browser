import { useAgentStore } from "../store/agentStore";
import { List, History, Settings, ShieldCheck, ShieldOff } from "lucide-react";
import AgentSelector from "./AgentSwitcher/AgentSelector";
import type { AgentConnectionState } from "@anthropic-ai/agents-in-browser-shared";
import { supportsSkipPermissions } from "@anthropic-ai/agents-in-browser-shared";

interface TopBarProps {
  activePanel: string;
  onOpenSettings: () => void;
  /** Open Settings on the Agents tab (e.g. from agent dropdown) */
  onOpenAgentsSettings: () => void;
  onOpenSessions: () => void;
  onOpenHistory: () => void;
  sendWsMessage: (type: string, payload: Record<string, unknown>) => boolean;
  skipPermissionsActive: boolean;
}

function StatusDot({ state }: { state: AgentConnectionState }) {
  const config: Record<AgentConnectionState, { dotColor: string; textColor: string; label: string }> = {
    connected: { dotColor: "var(--success, #6ee7b7)", textColor: "var(--success, #6ee7b7)", label: "Connected" },
    starting: { dotColor: "#3b82f6", textColor: "#60a5fa", label: "Starting" },
    disconnected: { dotColor: "var(--muted-foreground)", textColor: "var(--muted-foreground)", label: "Disconnected" },
    error: { dotColor: "var(--destructive)", textColor: "var(--destructive)", label: "Error" },
  };
  const { dotColor, textColor, label } = config[state];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
      <span style={{ fontSize: 11, color: textColor }}>{label}</span>
    </span>
  );
}

export default function TopBar({
  activePanel,
  onOpenSettings,
  onOpenAgentsSettings,
  onOpenSessions,
  onOpenHistory,
  sendWsMessage,
  skipPermissionsActive,
}: TopBarProps) {
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const agents = useAgentStore((s) => s.agents);
  const preflight = useAgentStore((s) => s.preflight);
  const currentAgent = agents.find((a) => a.id === currentAgentId);
  const showShield = currentAgent && supportsSkipPermissions(currentAgent);
  const preflightActive = !!preflight && preflight.agentId !== currentAgentId;
  const connectionState = currentAgent?.connectionState ?? "disconnected";

  const displayState: AgentConnectionState = preflightActive
    ? preflight.status === "checking" || preflight.status === "installing"
      ? "starting"
      : "error"
    : connectionState;

  const iconBtn = (isActive: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    background: isActive ? "rgba(110,231,183,0.12)" : "none",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    color: isActive ? "#6ee7b7" : "#9ca3af",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      height: 48, padding: "0 12px", flexShrink: 0,
      background: "var(--card, #1e2538)",
      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: "100%", flex: 1, minWidth: 0 }}>
        <AgentSelector
          sendWsMessage={sendWsMessage}
          onAddCustomAgent={onOpenAgentsSettings}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <StatusDot state={displayState} />
        {showShield && (
          <button
            onClick={() => {
              if (!skipPermissionsActive) {
                if (!window.confirm("确认开启跳过权限模式？Agent 将自动执行所有操作。")) return;
              }
              sendWsMessage("mode_toggle", { skipPermissions: !skipPermissionsActive });
            }}
            style={{
              ...iconBtn(false),
              color: skipPermissionsActive ? "var(--destructive, #f87171)" : "var(--success, #6ee7b7)",
              animation: skipPermissionsActive ? "pulse 2s ease-in-out infinite" : "none",
            }}
            aria-label={skipPermissionsActive ? "危险模式 — 已跳过权限" : "权限保护已开启"}
            title={skipPermissionsActive ? "危险模式 — 已跳过权限" : "权限保护已开启"}
          >
            {skipPermissionsActive ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
          </button>
        )}
        <button onClick={onOpenSessions} style={iconBtn(activePanel === "sessions")} aria-label="View sessions">
          <List size={18} />
        </button>
        <button onClick={onOpenHistory} style={iconBtn(activePanel === "history")} aria-label="View task history">
          <History size={18} />
        </button>
        <button onClick={onOpenSettings} style={iconBtn(activePanel === "settings")} aria-label="Open settings">
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
