import { Globe, Check } from "lucide-react";
import { useAgentStore } from "../store/agentStore";

export default function EmptyState() {
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const agents = useAgentStore((s) => s.agents);
  const currentAgent = agents.find((a) => a.id === currentAgentId);
  const agentState = currentAgent?.connectionState ?? "disconnected";

  const steps = [
    {
      number: 1,
      title: "Start Proxy Server",
      description: "Run the proxy server to bridge your browser with AI agents",
      command: "npx @anthropic-ai/acp-browser-proxy",
      done: agentState === "connected" || agentState === "starting",
    },
    {
      number: 2,
      title: "Select Agent",
      description: "Choose an AI agent from the dropdown above",
      command: null,
      done: currentAgent !== undefined,
    },
    {
      number: 3,
      title: "Start Chatting",
      description:
        "Send a message, attach page content, or use / shortcuts",
      command: null,
      done: false,
    },
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center px-10">
      <div className="w-full max-w-[320px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "#1e2640",
              border: "1px solid rgba(255,255,255,0.22)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5), 0 0 16px rgba(110,231,183,0.12)",
            }}
          >
            <Globe size={28} className="text-accent" aria-hidden="true" />
          </div>
          <h1 className="text-[18px] font-semibold text-text-primary mb-1">
            ACP Browser Client
          </h1>
          <p className="text-[13px] text-text-secondary">
            Connect AI agents to your browser
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-5">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-3">
              <div className="shrink-0">
                {step.done ? (
                  <div className="w-7 h-7 rounded-full border-2 border-accent flex items-center justify-center">
                    <Check size={14} className="text-accent" aria-hidden="true" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
                    <span className="text-[13px] font-semibold text-bg-primary">
                      {step.number}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                <div
                  className={`text-[14px] font-semibold ${
                    step.done ? "text-accent" : "text-text-primary"
                  }`}
                >
                  {step.title}
                </div>
                <div className="text-[12px] text-text-secondary mt-1 leading-relaxed">
                  {step.description}
                </div>
                {step.command && (
                  <div
                    className="mt-2 px-3 py-2 rounded-lg text-[11px] text-accent font-mono"
                    style={{
                      background: "#1e2640",
                      border: "1px solid rgba(255,255,255,0.18)",
                    }}
                  >
                    {step.command}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Help link */}
        <div className="flex items-center justify-center" style={{ paddingTop: 12, gap: 4 }}>
          <span className="text-[12px] text-text-secondary">
            Need help? Check the
          </span>
          <a
            href="https://github.com/anthropics/acp-browser-client"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-accent font-medium hover:underline"
          >
            documentation
          </a>
        </div>
      </div>
    </div>
  );
}
