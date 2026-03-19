import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, Check, Plus } from "lucide-react";
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
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors duration-150 max-w-[180px] focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select agent"
      >
        <span className="text-[14px]">{currentAgent?.icon || "🤖"}</span>
        <span className="text-[13px] font-medium text-text-primary truncate">
          {currentAgent?.name || "Select Agent"}
        </span>
        {open ? (
          <ChevronUp size={14} className="text-accent shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown size={14} className="text-text-muted shrink-0" aria-hidden="true" />
        )}
      </button>

      {open && (
        <>
          {/* Backdrop overlay */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div
            className="absolute top-full left-0 mt-1 w-[280px] glass-dropdown rounded-xl z-50 overflow-hidden animate-fade-in p-1.5"
            role="listbox"
          >
            {/* Preset Agents */}
            {presetAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleSelect(agent.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${
                  displayAgentId === agent.id
                    ? "bg-accent/10"
                    : "hover:bg-bg-hover/50"
                }`}
                role="option"
                aria-selected={displayAgentId === agent.id}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[13px] shrink-0 ${
                  displayAgentId === agent.id ? "bg-accent/10" : "bg-bg-hover"
                }`}>
                  {agent.icon || "🤖"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-medium truncate ${
                    displayAgentId === agent.id ? "text-accent" : "text-text-primary"
                  }`}>
                    {agent.name}
                  </div>
                  <div className="text-[10px] text-text-secondary truncate">
                    {agent.description}
                  </div>
                </div>
                {displayAgentId === agent.id && (
                  <Check size={14} className="text-accent shrink-0" aria-hidden="true" />
                )}
              </button>
            ))}

            {customAgents.length > 0 && (
              <>
                <div className="mx-2 my-1 border-t border-border" />
                {customAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => handleSelect(agent.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${
                      displayAgentId === agent.id
                        ? "bg-accent/10"
                        : "hover:bg-bg-hover/50"
                    }`}
                    role="option"
                    aria-selected={displayAgentId === agent.id}
                  >
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[13px] shrink-0 ${
                      displayAgentId === agent.id ? "bg-accent/10" : "bg-bg-hover"
                    }`}>
                      {agent.icon || "⚙️"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-medium truncate ${
                        displayAgentId === agent.id ? "text-accent" : "text-text-primary"
                      }`}>
                        {agent.name}
                      </div>
                      <div className="text-[10px] text-text-secondary truncate">
                        {agent.description}
                      </div>
                    </div>
                    {displayAgentId === agent.id && (
                      <Check size={14} className="text-accent shrink-0" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </>
            )}

            {/* Divider + carry context & add agent */}
            <div className="mx-2 my-1 border-t border-border" />
            <div className="px-3 py-2 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={carryContext}
                  onChange={(e) => setCarryContext(e.target.checked)}
                  className="w-3 h-3 rounded border-border accent-accent"
                />
                <span className="text-[11px] text-text-secondary">
                  Carry context
                </span>
              </label>
              <button
                className="flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary transition-colors"
                onClick={() => setOpen(false)}
              >
                <Plus size={14} aria-hidden="true" />
                Add Agent
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
