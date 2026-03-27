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
} from "@anthropic-ai/agents-in-browser-shared";
import { supportsSkipPermissions } from "@anthropic-ai/agents-in-browser-shared";
import {
  DEFAULT_MCP_URL,
  POOL_IDLE_TIMEOUT_MS,
  POOL_MAX_SIZE,
} from "@anthropic-ai/agents-in-browser-shared";

interface AgentSession {
  agentId: string;
  sessionId: string;
  lastActive: number;
  cwd?: string;
}

interface PoolEntry {
  client: AcpClient;
  guard: ProcessGuard;
  session: AgentSession | null;
  config: AgentConfig;
  lastActive: number;
  skillInjectedSessions: Set<string>;
  evictionTimer: ReturnType<typeof setTimeout> | null;
}

export class AgentManager extends EventEmitter {
  private pool = new Map<string, PoolEntry>();
  private activeAgentId: string | null = null;
  private currentAgent: AgentConfig | null = null;
  private switching = false;
  private mcpUrl: string;
  private useDirectControl: boolean;

  constructor(mcpUrl: string = DEFAULT_MCP_URL) {
    super();
    this.mcpUrl = mcpUrl;
    this.useDirectControl = supportsDirectBrowserControl();
  }

  get activeAgent() {
    return this.currentAgent;
  }
  get currentAgentName(): string {
    return this.currentAgent?.name ?? "Agent";
  }
  get sessionId() {
    return this.getActiveEntry()?.session?.sessionId;
  }

  // ---------------------------------------------------------------------------
  // Pool helpers
  // ---------------------------------------------------------------------------

  private getActiveEntry(): PoolEntry | null {
    if (!this.activeAgentId) return null;
    return this.pool.get(this.activeAgentId) ?? null;
  }

  private async createPoolEntry(config: AgentConfig): Promise<PoolEntry> {
    const client = new AcpClient();
    const guard = new ProcessGuard(client);

    const entry: PoolEntry = {
      client,
      guard,
      session: null,
      config,
      lastActive: Date.now(),
      skillInjectedSessions: new Set(),
      evictionTimer: null,
    };

    // Wire events — only forward when this agent is active
    client.on("session_update", (update: AcpSessionUpdate) => {
      if (this.activeAgentId === config.id) {
        this.emit("session_update", update);
      }
    });

    client.on("permission_request", (params: unknown) => {
      if (this.activeAgentId === config.id) {
        this.emit("permission_request", params);
      }
    });

    guard.on("restarted", async () => {
      if (this.activeAgentId !== config.id) return;
      if (!this.currentAgent) return;
      try {
        const sessionId = await client.sessionNew();
        entry.session = {
          agentId: config.id,
          sessionId,
          lastActive: Date.now(),
        };
        this.emitState("connected");
      } catch (err) {
        console.error("[AgentManager] Failed to create session after restart:", err);
        this.emitState("error");
      }
    });

    guard.on("give_up", () => {
      if (this.activeAgentId === config.id) {
        this.emitState("error");
        this.emit("agent_error", new Error("Agent process failed to restart"));
      }
      this.evictEntry(config.id);
    });

    // Start the process + ACP initialize handshake
    const effectiveArgs = this.computeEffectiveArgs(config);
    await client.start({
      command: config.command,
      args: effectiveArgs,
      cwd: config.cwd,
      env: config.env,
    });

    guard.setOptions({
      command: config.command,
      args: effectiveArgs,
      cwd: config.cwd,
      env: config.env,
    });

    return entry;
  }

  private async createSession(entry: PoolEntry, cwd?: string): Promise<string> {
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

    const sessionId = await entry.client.sessionNew(cwd, mcpServers);
    entry.session = {
      agentId: entry.config.id,
      sessionId,
      lastActive: Date.now(),
      cwd: cwd ?? entry.config.cwd,
    };
    return sessionId;
  }

  private evictEntry(agentId: string): void {
    const entry = this.pool.get(agentId);
    if (!entry) return;

    console.log(`[AgentManager] Evicting pool entry: ${agentId}`);

    if (entry.evictionTimer) {
      clearTimeout(entry.evictionTimer);
      entry.evictionTimer = null;
    }

    entry.guard.destroy();
    // Fire-and-forget force stop
    entry.client.stop({ force: true }).catch((err) => {
      console.error(`[AgentManager] Error stopping evicted client ${agentId}:`, err);
    });

    this.pool.delete(agentId);
  }

  private resetEvictionTimer(agentId: string): void {
    const entry = this.pool.get(agentId);
    if (!entry) return;

    if (entry.evictionTimer) {
      clearTimeout(entry.evictionTimer);
    }

    // Don't evict the active agent
    if (this.activeAgentId === agentId) {
      entry.evictionTimer = null;
      return;
    }

    entry.evictionTimer = setTimeout(() => {
      console.log(`[AgentManager] Idle timeout for ${agentId}, evicting`);
      this.evictEntry(agentId);
    }, POOL_IDLE_TIMEOUT_MS);
  }

  private ensurePoolCapacity(): void {
    if (this.pool.size < POOL_MAX_SIZE) return;

    // Find the oldest idle entry (not the active one)
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.pool) {
      if (id === this.activeAgentId) continue;
      if (entry.lastActive < oldestTime) {
        oldestTime = entry.lastActive;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.evictEntry(oldestId);
    }
  }

  private computeEffectiveArgs(config: AgentConfig): string[] {
    const flag = "--dangerously-skip-permissions";
    const base = config.args.filter((a) => a !== flag);
    return config.skipPermissions ? [...base, flag] : base;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  get isSkipPermissions(): boolean {
    const entry = this.getActiveEntry();
    return entry?.config.args.includes("--dangerously-skip-permissions") ?? false;
  }

  async toggleSkipPermissions(skip: boolean): Promise<string> {
    const entry = this.getActiveEntry();
    if (!entry || !this.currentAgent) {
      throw new Error("No active agent");
    }
    if (!supportsSkipPermissions(this.currentAgent)) {
      throw new Error("Agent does not support skip-permissions");
    }

    const newConfig: AgentConfig = {
      ...this.currentAgent,
      skipPermissions: skip,
    };
    newConfig.args = this.computeEffectiveArgs(newConfig);

    this.evictEntry(this.currentAgent.id);
    this.activeAgentId = null;

    return this.switchAgent(newConfig);
  }

  async switchAgent(config: AgentConfig): Promise<string> {
    if (this.switching) {
      throw new Error("Agent switch already in progress");
    }
    this.switching = true;

    try {
      return await this.doSwitch(config);
    } finally {
      this.switching = false;
    }
  }

  private async doSwitch(config: AgentConfig): Promise<string> {
    const targetId = config.id;

    // Case 1: Already active — return current session
    if (this.activeAgentId === targetId) {
      const entry = this.pool.get(targetId);
      if (entry?.session) {
        this.emitState("connected");
        return entry.session.sessionId;
      }
      if (entry?.client.initialized) {
        const sessionId = await this.createSession(entry);
        this.emitState("connected");
        return sessionId;
      }
    }

    // Deactivate current agent (keep alive in pool)
    if (this.activeAgentId) {
      const oldEntry = this.pool.get(this.activeAgentId);
      if (oldEntry) {
        oldEntry.lastActive = Date.now();
        this.resetEvictionTimer(this.activeAgentId);
      }
      this.emitState("disconnected");
    }

    this.currentAgent = config;
    this.activeAgentId = targetId;

    // Case 2: Agent in pool and alive — instant switch
    const existingEntry = this.pool.get(targetId);
    if (existingEntry?.client.running && existingEntry.client.initialized) {
      console.log(`[AgentManager] Instant switch to pooled agent: ${targetId}`);

      if (existingEntry.evictionTimer) {
        clearTimeout(existingEntry.evictionTimer);
        existingEntry.evictionTimer = null;
      }
      existingEntry.lastActive = Date.now();

      if (existingEntry.session) {
        this.emitState("connected");
        return existingEntry.session.sessionId;
      }

      // Process alive but no session (e.g. after restart) — create one
      this.emitState("starting");
      try {
        const sessionId = await this.createSession(existingEntry);
        this.emitState("connected");
        return sessionId;
      } catch (err) {
        this.emitState("error");
        throw err;
      }
    }

    // Case 3: Not in pool — spawn new process
    this.emitState("starting");

    // Clean up dead/uninitialized pool entry if exists
    if (existingEntry) {
      this.evictEntry(targetId);
    }

    this.ensurePoolCapacity();

    try {
      const entry = await this.createPoolEntry(config);
      this.pool.set(targetId, entry);

      if (this.useDirectControl) {
        console.log("[AgentManager] Using direct browser control (skill-based)");
      }

      const sessionId = await this.createSession(entry);
      this.emitState("connected");
      return sessionId;
    } catch (err) {
      this.emitState("error");
      throw err;
    }
  }

  async newSession(): Promise<string> {
    const entry = this.getActiveEntry();
    if (!entry?.client.initialized) {
      throw new Error("Agent not connected");
    }
    if (!this.currentAgent) {
      throw new Error("No agent configured");
    }
    const sessionId = await this.createSession(entry);
    return sessionId;
  }

  async prompt(
    sessionId: string,
    text: string,
    attachments?: AcpAttachment[],
    onUpdate?: (update: AcpSessionUpdate) => void,
  ): Promise<void> {
    const entry = this.getActiveEntry();
    if (!entry?.client.initialized) {
      throw new Error("Agent not connected");
    }

    if (entry.session) {
      entry.session.lastActive = Date.now();
    }
    entry.lastActive = Date.now();

    // Fall back to current session if the requested session doesn't exist
    const effectiveSessionId = entry.session?.sessionId === sessionId
      ? sessionId
      : entry.session?.sessionId ?? sessionId;
    if (effectiveSessionId !== sessionId) {
      console.log(`[AgentManager] Session ${sessionId} not found, using active session ${effectiveSessionId}`);
    }

    // Inject browser control skill instructions on first prompt of each session
    let promptText = text;
    if (this.useDirectControl && !entry.skillInjectedSessions.has(effectiveSessionId)) {
      const instructions = loadBrowserControlInstructions();
      if (instructions) {
        promptText =
          `[BROWSER CONTROL INSTRUCTIONS]\n${instructions}\n[END BROWSER CONTROL INSTRUCTIONS]\n\n${text}`;
        entry.skillInjectedSessions.add(effectiveSessionId);
        console.log("[AgentManager] Injected browser control skill instructions");
      }
    }

    await entry.client.sessionPrompt(
      effectiveSessionId,
      promptText,
      undefined,
      attachments,
      onUpdate,
    );
  }

  async cancel(sessionId: string): Promise<void> {
    const entry = this.getActiveEntry();
    if (!entry?.client.initialized) return;
    await entry.client.sessionCancel(sessionId);
  }

  async permissionRespond(
    requestId: string,
    approved: boolean,
    acpRequestId?: number | string,
    remember?: boolean,
  ): Promise<void> {
    const entry = this.getActiveEntry();
    if (!entry?.client.initialized) return;
    await entry.client.permissionRespond(requestId, approved, acpRequestId, remember);
  }

  async shutdown(): Promise<void> {
    const stopPromises: Promise<void>[] = [];
    for (const [id, entry] of this.pool) {
      if (entry.evictionTimer) clearTimeout(entry.evictionTimer);
      entry.guard.destroy();
      stopPromises.push(
        entry.client.stop({ force: true }).catch((err) => {
          console.error(`[AgentManager] Error stopping ${id}:`, err);
        }),
      );
    }
    await Promise.all(stopPromises);
    this.pool.clear();
    this.activeAgentId = null;
    this.currentAgent = null;
  }

  // ---------------------------------------------------------------------------
  // Session management queries
  // ---------------------------------------------------------------------------

  getSessionStatus(): {
    sessionId: string;
    agentId: string;
    cwd: string;
    state: string;
    lastActive: number;
  } | null {
    const entry = this.getActiveEntry();
    if (!entry?.session) return null;
    return {
      sessionId: entry.session.sessionId,
      agentId: entry.session.agentId,
      cwd: entry.session.cwd ?? entry.config.cwd ?? process.cwd(),
      state: entry.client.initialized ? "active" : "disconnected",
      lastActive: entry.session.lastActive,
    };
  }

  getPoolSessions(): Array<{
    sessionId: string;
    agentId: string;
    name?: string;
    state: string;
    lastActive: number;
    cwd?: string;
  }> {
    const results: Array<{
      sessionId: string;
      agentId: string;
      name?: string;
      state: string;
      lastActive: number;
      cwd?: string;
    }> = [];

    for (const [id, entry] of this.pool) {
      if (!entry.session) continue;
      results.push({
        sessionId: entry.session.sessionId,
        agentId: entry.session.agentId,
        state: id === this.activeAgentId ? "active" : "idle",
        lastActive: entry.session.lastActive,
        cwd: entry.session.cwd ?? entry.config.cwd,
      });
    }

    return results;
  }

  async newSessionWithCwd(cwd: string): Promise<string> {
    const entry = this.getActiveEntry();
    if (!entry?.client.initialized) {
      throw new Error("Agent not connected");
    }
    const sessionId = await this.createSession(entry, cwd);
    return sessionId;
  }

  touchAgent(agentId: string): void {
    const entry = this.pool.get(agentId);
    if (!entry) return;
    entry.lastActive = Date.now();
    if (entry.session) {
      entry.session.lastActive = Date.now();
    }
    this.resetEvictionTimer(agentId);
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
