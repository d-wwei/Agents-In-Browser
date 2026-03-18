import { useState, useRef, useEffect, useCallback } from "react";
import { useAgentStore } from "../../store/agentStore";

interface AgentSelectorProps {
  sendWsMessage: (type: string, payload: Record<string, unknown>) => boolean;
}

export default function AgentSelector({ sendWsMessage }: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [carryContext, setCarryContext] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const agents = useAgentStore((s) => s.agents);
  const preflight = useAgentStore((s) => s.preflight);
  const setPreflight = useAgentStore((s) => s.setPreflight);
  const displayAgentId = preflight?.agentId ?? currentAgentId;
  const currentAgent = agents.find((a) => a.id === displayAgentId);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = useCallback(
    (agentId: string) => {
      if (agentId === displayAgentId) {
        setOpen(false);
        return;
      }

      const agent = agents.find((a) => a.id === agentId);
      if (!agent) {
        setOpen(false);
        return;
      }

      const sent = sendWsMessage("agent_preflight_check", {
        agentId: agent.id,
        config: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          command: agent.command,
          args: agent.args,
          env: agent.env,
          icon: agent.icon,
          isCustom: agent.isCustom,
          installInstructions: agent.installInstructions,
        },
        reason: "manual",
        carryContext,
      });
      setPreflight({
        agentId: agent.id,
        agentName: agent.name,
        config: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          command: agent.command,
          args: agent.args,
          env: agent.env,
          icon: agent.icon,
          isCustom: agent.isCustom,
        },
        reason: "manual",
        carryContext,
        status: sent ? "checking" : "error",
        message: sent
          ? `Checking whether ${agent.name} is installed...`
          : "Proxy is disconnected. Reconnect first, then try switching agents again.",
        installInstructions: agent.installInstructions,
      });
      setOpen(false);
    },
    [agents, currentAgentId, displayAgentId, setPreflight, sendWsMessage, carryContext],
  );

  const presetAgents = agents.filter((a) => !a.isCustom);
  const customAgents = agents.filter((a) => a.isCustom);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover transition-colors max-w-[180px]"
      >
        <span className="text-[14px]">{currentAgent?.icon || "🤖"}</span>
        <span className="text-[13px] text-text-primary truncate">
          {currentAgent?.name || "Select Agent"}
        </span>
        <svg
          className={`w-3 h-3 text-text-muted shrink-0 transition-transform ${
            open ? "rotate-180" : ""
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

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-bg-secondary border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
          {/* Preset agents */}
          <div className="py-1">
            <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider">
              Preset Agents
            </div>
            {presetAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleSelect(agent.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-hover transition-colors ${
                  displayAgentId === agent.id ? "bg-bg-hover" : ""
                }`}
              >
                <span className="text-[14px]">{agent.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-text-primary truncate">
                    {agent.name}
                  </div>
                  <div className="text-[10px] text-text-muted truncate">
                    {agent.description}
                  </div>
                </div>
                {displayAgentId === agent.id && (
                  <svg
                    className="w-3 h-3 text-accent shrink-0"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="2 6 5 9 10 3" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Custom agents */}
          {customAgents.length > 0 && (
            <div className="py-1 border-t border-border">
              <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider">
                Custom Agents
              </div>
              {customAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-hover transition-colors ${
                    displayAgentId === agent.id ? "bg-bg-hover" : ""
                  }`}
                >
                  <span className="text-[14px]">{agent.icon || "⚙️"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-text-primary truncate">
                      {agent.name}
                    </div>
                    <div className="text-[10px] text-text-muted truncate">
                      {agent.description}
                    </div>
                  </div>
                  {displayAgentId === agent.id && (
                    <svg
                      className="w-3 h-3 text-accent shrink-0"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="2 6 5 9 10 3" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Carry context checkbox */}
          <div className="border-t border-border px-3 py-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={carryContext}
                onChange={(e) => setCarryContext(e.target.checked)}
                className="w-3 h-3 rounded border-border accent-accent"
              />
              <span className="text-[11px] text-text-secondary">
                Carry context to new agent
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
