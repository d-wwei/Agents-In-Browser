import { EventEmitter } from "events";
import { AcpClient } from "./acpClient";
import { ProcessGuard } from "./processGuard";
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
  private recentSessions = new Map<string, AgentSession>(); // agentId -> session
  private mcpUrl: string;

  constructor(mcpUrl: string = DEFAULT_MCP_URL) {
    super();
    this.mcpUrl = mcpUrl;
    this.client = new AcpClient();
    this.guard = new ProcessGuard(this.client);

    this.client.on("session_update", (update: AcpSessionUpdate) => {
      this.emit("session_update", update);
    });

    this.client.on("permission_request", (params: unknown) => {
      this.emit("permission_request", params);
    });

    this.guard.on("restarted", async () => {
      // Re-establish session after restart
      try {
        const sessionId = await this.client.sessionNew();
        this.currentSession = {
          agentId: this.currentAgent!.id,
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

      // MCP servers are passed at session creation, not prompt time
      const mcpServers: AcpMcpServerConfig[] = [
        {
          name: "browser-tools",
          type: "http",
          url: this.mcpUrl,
          headers: [],
        },
      ];

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

    const sessionId = await this.client.sessionNew();
    this.currentSession = {
      agentId: this.currentAgent!.id,
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

    await this.client.sessionPrompt(
      sessionId,
      text,
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
