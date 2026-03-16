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
    <div className="h-full flex flex-col items-center justify-center px-8">
      <div className="max-w-[280px] w-full">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="text-[28px] mb-2">
            <span role="img" aria-label="browser">
              🌐
            </span>
          </div>
          <h1 className="text-[16px] font-semibold text-text-primary mb-1">
            ACP Browser Client
          </h1>
          <p className="text-[12px] text-text-muted">
            Connect AI agents to your browser
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-3">
              {/* Step number / check */}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-medium ${
                  step.done
                    ? "bg-success/20 text-success"
                    : "bg-bg-secondary text-text-muted border border-border"
                }`}
              >
                {step.done ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="2 6 5 9 10 3" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div
                  className={`text-[13px] font-medium ${
                    step.done ? "text-success" : "text-text-primary"
                  }`}
                >
                  {step.title}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {step.description}
                </div>
                {step.command && (
                  <code className="block mt-1.5 bg-bg-secondary rounded px-2 py-1 text-[11px] text-accent border border-border">
                    {step.command}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Help link */}
        <div className="mt-8 text-center">
          <p className="text-[11px] text-text-muted">
            Need help? Check the{" "}
            <a
              href="https://github.com/anthropics/acp-browser-client"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
