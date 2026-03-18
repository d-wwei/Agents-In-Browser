import { EventEmitter } from "events";
import { AcpClient } from "./acpClient";
import { ProcessGuard } from "./processGuard";
import {
  loadBrowserControlInstructions,
  supportsDirectBrowserControl,
} from "./skillLoader";
import type {
  AgentConfig,
  AcpSessionUpdate,
  AcpMcpServerConfig,
  AcpAttachment,
  AgentConnectionState,
} from "@anthropic-ai/acp-browser-shared";
import {
  DEFAULT_MCP_URL,
  P0_TOOL_NAMES,
  SESSION_RESUME_WINDOW_MS,
} from "@anthropic-ai/acp-browser-shared";

interface AgentSession {
  agentId: string;
  sessionId: string;
  lastActive: number;
}

export class AgentManager extends EventEmitter {
  private client: AcpClient;
  private guard: ProcessGuard;
  private currentAgent: AgentConfig | null = null;
  private currentSession: AgentSession | null = null;
  private static readonly MAX_RECENT_SESSIONS = 50;
  private recentSessions = new Map<string, AgentSession>(); // agentId -> session
  private mcpUrl: string;
  private useDirectControl: boolean;
  private skillInjected = new Set<string>(); // sessionIds that got skill instructions

  constructor(mcpUrl: string = DEFAULT_MCP_URL) {
    super();
    this.mcpUrl = mcpUrl;
    this.useDirectControl = supportsDirectBrowserControl();
    this.client = new AcpClient();
    this.guard = new ProcessGuard(this.client);

    this.client.on("session_update", (update: AcpSessionUpdate) => {
      this.emit("session_update", update);
    });

    this.client.on("permission_request", (params: unknown) => {
      this.emit("permission_request", params);
    });

    this.guard.on("restarted", async () => {
      if (!this.currentAgent) return;
      try {
        const sessionId = await this.client.sessionNew();
        this.currentSession = {
          agentId: this.currentAgent.id,
          sessionId,
          lastActive: Date.now(),
        };
        this.emitState("connected");
      } catch (err) {
        console.error("[AgentManager] Failed to create session after restart:", err);
        this.emitState("error");
      }
    });

    this.guard.on("give_up", () => {
      this.emitState("error");
      this.emit("agent_error", new Error("Agent process failed to restart"));
    });
  }

  get activeAgent() {
    return this.currentAgent;
  }
  get sessionId() {
    return this.currentSession?.sessionId;
  }

  async switchAgent(config: AgentConfig): Promise<string> {
    // Save current session for potential resume
    if (this.currentSession) {
      this.currentSession.lastActive = Date.now();
      this.recentSessions.set(
        this.currentSession.agentId,
        this.currentSession,
      );
      // Evict oldest entries if exceeding limit
      if (this.recentSessions.size > AgentManager.MAX_RECENT_SESSIONS) {
        const first = this.recentSessions.keys().next().value;
        if (first !== undefined) this.recentSessions.delete(first);
      }
    }

    // Stop current agent
    if (this.client.running) {
      this.emitState("disconnected");
      this.guard.stop();
      await this.client.stop();
    }

    this.currentAgent = config;
    this.emitState("starting");

    // Check for session resume
    const recent = this.recentSessions.get(config.id);
    if (
      recent &&
      Date.now() - recent.lastActive < SESSION_RESUME_WINDOW_MS
    ) {
      // Try to resume existing session - but process is dead, so we just
      // remember the session ID for UI continuity
      this.recentSessions.delete(config.id);
    }

    // Start new agent
    try {
      await this.client.start({
        command: config.command,
        args: config.args,
        env: config.env,
      });

      this.guard.setOptions({
        command: config.command,
        args: config.args,
        env: config.env,
      });

      // Direct browser control: skip MCP servers, agent uses shell commands instead
      // MCP bridge fallback: pass MCP servers for platforms without direct control
      const mcpServers: AcpMcpServerConfig[] = this.useDirectControl
        ? []
        : [
            {
              name: "browser-tools",
              type: "http",
              url: this.mcpUrl,
              headers: [],
            },
          ];

      if (this.useDirectControl) {
        console.log("[AgentManager] Using direct browser control (skill-based)");
      }

      const sessionId = await this.client.sessionNew(undefined, mcpServers);
      this.currentSession = {
        agentId: config.id,
        sessionId,
        lastActive: Date.now(),
      };

      this.emitState("connected");
      return sessionId;
    } catch (err) {
      this.emitState("error");
      throw err;
    }
  }

  async newSession(): Promise<string> {
    if (!this.client.initialized) {
      throw new Error("Agent not connected");
    }

    if (!this.currentAgent) {
      throw new Error("No agent configured");
    }
    const sessionId = await this.client.sessionNew();
    this.currentSession = {
      agentId: this.currentAgent.id,
      sessionId,
      lastActive: Date.now(),
    };
    return sessionId;
  }

  async prompt(
    sessionId: string,
    text: string,
    attachments?: AcpAttachment[],
    onUpdate?: (update: AcpSessionUpdate) => void,
  ): Promise<void> {
    if (!this.client.initialized) {
      throw new Error("Agent not connected");
    }

    if (this.currentSession) {
      this.currentSession.lastActive = Date.now();
    }

    // Inject browser control skill instructions on first prompt of each session
    let promptText = text;
    if (this.useDirectControl && !this.skillInjected.has(sessionId)) {
      const instructions = loadBrowserControlInstructions();
      if (instructions) {
        promptText =
          `[BROWSER CONTROL INSTRUCTIONS]\n${instructions}\n[END BROWSER CONTROL INSTRUCTIONS]\n\n${text}`;
        this.skillInjected.add(sessionId);
        console.log("[AgentManager] Injected browser control skill instructions");
      }
    }

    await this.client.sessionPrompt(
      sessionId,
      promptText,
      undefined,
      attachments,
      onUpdate,
    );
  }

  async cancel(sessionId: string): Promise<void> {
    if (!this.client.initialized) return;
    await this.client.sessionCancel(sessionId);
  }

  async permissionRespond(
    requestId: string,
    approved: boolean,
  ): Promise<void> {
    if (!this.client.initialized) return;
    await this.client.permissionRespond(requestId, approved);
  }

  async shutdown(): Promise<void> {
    this.guard.stop();
    await this.client.stop();
    this.currentAgent = null;
    this.currentSession = null;
    this.skillInjected.clear();
    this.recentSessions.clear();
  }

  private emitState(state: AgentConnectionState) {
    if (this.currentAgent) {
      this.emit("agent_state", {
        agentId: this.currentAgent.id,
        state,
      });
    }
  }
}
