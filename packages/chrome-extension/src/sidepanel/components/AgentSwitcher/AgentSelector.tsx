import { useState, useRef, useEffect, useCallback } from "react";
import { PenTool, ChevronDown, ChevronUp, Check, Plus, Bot, Code, Search } from "lucide-react";
import { useAgentStore } from "../../store/agentStore";

interface AgentSelectorProps {
  sendWsMessage: (type: string, payload: Record<string, unknown>) => boolean;
  /** Opens Settings → Agents (custom agents are configured there) */
  onAddCustomAgent?: () => void;
}

const AGENT_ICON_MAP: Record<string, { icon: React.ReactNode; bg: string }> = {
  bot: {
    icon: <Bot size={14} className="text-accent" />,
    bg: "rgba(110,231,183,0.1)",
  },
  code: {
    icon: <Code size={14} className="text-indigo-400" />,
    bg: "rgba(99,102,241,0.1)",
  },
  search: {
    icon: <Search size={14} className="text-red-400" />,
    bg: "rgba(232,90,79,0.1)",
  },
};

function getAgentIcon(index: number) {
  const keys = ["bot", "code", "search"];
  return AGENT_ICON_MAP[keys[index % keys.length]];
}

export default function AgentSelector({
  sendWsMessage,
  onAddCustomAgent,
}: AgentSelectorProps) {
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
    [agents, displayAgentId, setPreflight, sendWsMessage, carryContext],
  );

  const presetAgents = agents.filter((a) => !a.isCustom);
  const customAgents = agents.filter((a) => a.isCustom);

  return (
    <div ref={dropdownRef} className="relative h-full flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-full cursor-pointer"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select agent"
      >
        <PenTool size={16} className="text-accent shrink-0" />
        <span className="text-[13px] font-medium text-foreground truncate max-w-[140px]">
          {currentAgent?.name || "Select Agent"}
        </span>
        {open ? (
          <ChevronUp size={14} className="text-accent shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(15,17,23,0.5)" }}
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div
            className="absolute top-full left-0 mt-1 w-[280px] rounded-xl z-50 overflow-hidden animate-fade-in"
            style={{
              backgroundColor: "#1e2538",
              border: "1px solid var(--border-card, rgba(255,255,255,0.19))",
              boxShadow:
                "0 4px 16px rgba(0,0,0,0.38), 0 0 12px rgba(110,231,183,0.09)",
              padding: 6,
            }}
            role="listbox"
          >
            {presetAgents.map((agent, i) => {
              const iconConfig = getAgentIcon(i);
              const isSelected = displayAgentId === agent.id;

              return (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg text-left transition-colors duration-150 cursor-pointer mb-0.5 ${
                    isSelected ? "" : "hover:bg-[rgba(255,255,255,0.05)]"
                  }`}
                  style={{
                    padding: "10px 12px",
                    backgroundColor: isSelected
                      ? "rgba(110,231,183,0.1)"
                      : undefined,
                  }}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: iconConfig.bg }}
                  >
                    {iconConfig.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-[13px] font-medium truncate ${
                        isSelected ? "text-accent" : "text-foreground"
                      }`}
                    >
                      {agent.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {agent.description}
                    </div>
                  </div>
                  {isSelected && (
                    <Check size={14} className="text-accent shrink-0" />
                  )}
                </button>
              );
            })}

            {customAgents.length > 0 && (
              <>
                <div
                  className="my-1"
                  style={{
                    borderTop: "1px solid var(--border, rgba(255,255,255,0.18))",
                  }}
                />
                {customAgents.map((agent) => {
                  const isSelected = displayAgentId === agent.id;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => handleSelect(agent.id)}
                      className={`w-full flex items-center gap-2.5 rounded-lg text-left transition-colors duration-150 cursor-pointer mb-0.5 ${
                        isSelected ? "" : "hover:bg-[rgba(255,255,255,0.05)]"
                      }`}
                      style={{
                        padding: "10px 12px",
                        backgroundColor: isSelected
                          ? "rgba(110,231,183,0.1)"
                          : undefined,
                      }}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: "rgba(110,231,183,0.1)" }}
                      >
                        <Bot size={14} className="text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[13px] font-medium truncate ${
                            isSelected ? "text-accent" : "text-foreground"
                          }`}
                        >
                          {agent.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {agent.description}
                        </div>
                      </div>
                      {isSelected && (
                        <Check size={14} className="text-accent shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            <div
              className="my-1"
              style={{
                borderTop: "1px solid var(--border, rgba(255,255,255,0.18))",
              }}
            />

            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              style={{ padding: "8px 12px" }}
              onClick={() => {
                setOpen(false);
                onAddCustomAgent?.();
              }}
            >
              <Plus size={14} />
              <span className="text-xs font-medium">Add Custom Agent</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
