import { Globe, Check, MessageSquare, Paperclip, Command } from "lucide-react";
import { useAgentStore } from "../store/agentStore";

function ConnectedEmptyState({ agentName }: { agentName: string }) {
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "0 40px",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 32,
        background: "linear-gradient(135deg, var(--accent), rgba(110,231,183,0.6))",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 24px rgba(110,231,183,0.25)",
      }}>
        <MessageSquare size={28} style={{ color: "var(--primary-foreground)" }} />
      </div>

      <div style={{
        width: "100%", display: "flex", flexDirection: "column", alignItems: "center",
        gap: 6, paddingTop: 20, paddingBottom: 32,
      }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", textAlign: "center" }}>
          Ready to go
        </span>
        <span style={{ fontSize: 13, color: "var(--muted-foreground)", textAlign: "center", lineHeight: 1.5 }}>
          Connected to <span style={{ color: "var(--accent)", fontWeight: 500 }}>{agentName}</span>. Type a task below to get started.
        </span>
      </div>

      <div style={{
        width: "100%", display: "flex", flexDirection: "column", gap: 12,
        padding: "16px", borderRadius: 12,
        background: "var(--card)",
        border: "1px solid var(--border-card, rgba(255,255,255,0.08))",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MessageSquare size={15} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Send a message to start a conversation
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Paperclip size={15} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Attach page content for context
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Command size={15} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Use <span style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>/</span> shortcuts for quick actions
          </span>
        </div>
      </div>
    </div>
  );
}

function OnboardingEmptyState() {
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "0 40px",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center",
        border: "1px solid var(--border-card, rgba(255,255,255,0.19))",
        boxShadow: "0 2px 8px rgba(0,0,0,0.19), 0 0 12px rgba(110,231,183,0.15)",
      }}>
        <Globe size={28} style={{ color: "var(--accent)" }} />
      </div>

      <div style={{
        width: "100%", display: "flex", flexDirection: "column", alignItems: "center",
        gap: 4, paddingTop: 16, paddingBottom: 24,
      }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", textAlign: "center" }}>
          Agents In Browser
        </span>
        <span style={{ fontSize: 13, color: "var(--muted-foreground)", textAlign: "center" }}>
          Connect AI agents to your browser
        </span>
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14, flexShrink: 0,
            background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary-foreground)" }}>1</span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>Start Proxy Server</span>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              Run the proxy server to bridge your browser with AI agents
            </span>
            <div style={{
              width: "100%", marginTop: 4,
              background: "var(--card)", borderRadius: 8,
              border: "1px solid var(--border)",
              padding: "8px 12px",
            }}>
              <code style={{
                fontSize: 11, color: "var(--accent)",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}>
                npx @anthropic-ai/agents-in-browser-proxy
              </code>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14, flexShrink: 0,
            border: "2px solid var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Check size={14} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>Select Agent</span>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              Choose an AI agent from the dropdown above
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14, flexShrink: 0,
            background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary-foreground)" }}>3</span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>Start Chatting</span>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              Send a message, attach page content, or use / shortcuts
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingTop: 12 }}>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Need help? Check the</span>
        <a
          href="https://github.com/anthropics/anthropic-quickstarts"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, fontWeight: 500, color: "var(--accent)", textDecoration: "none" }}
        >
          documentation
        </a>
      </div>
    </div>
  );
}

export default function EmptyState() {
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const agents = useAgentStore((s) => s.agents);
  const currentAgent = agents.find((a) => a.id === currentAgentId);
  const agentState = currentAgent?.connectionState ?? "disconnected";

  if (agentState === "connected") {
    return <ConnectedEmptyState agentName={currentAgent?.name ?? "Agent"} />;
  }

  return <OnboardingEmptyState />;
}
