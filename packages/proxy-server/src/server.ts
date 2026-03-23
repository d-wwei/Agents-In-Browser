import { createServer, type IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import { AgentManager } from "./agentManager";
import { McpBridge } from "./mcpBridge";
import { getOrCreateAuthToken, validateOrigin, validateToken } from "./auth";
import { supportsDirectBrowserControl } from "./skillLoader";
import { installAgentDependencies, isCommandAvailable } from "./agentPrereq";
import {
  createMessage,
  PROTOCOL_VERSION,
  APP_VERSION,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_DEAD_MS,
  DEFAULT_WS_PORT,
  DEFAULT_MCP_PORT,
  DEFAULT_MCP_URL,
  PRESET_AGENTS,
  getAgentById,
} from "@anthropic-ai/agents-in-browser-shared";
import type {
  WsMessage,
  ExtToProxyMessage,
  PromptPayload,
  SwitchAgentPayload,
  PermissionResponsePayload,
  ToolResultPayload,
  AcpSessionUpdate,
  AgentConfig,
  AcpAttachment,
  BrowserStateResponsePayload,
  AgentPreflightCheckPayload,
  AgentInstallRequestPayload,
} from "@anthropic-ai/agents-in-browser-shared";

interface BrowserStateSnapshot {
  activeTab: { id?: number; url?: string; title?: string } | null;
  tabs: Array<{ id?: number; url?: string; title?: string; active?: boolean }>;
  interactiveElements?: Array<{
    index: number;
    tag: string;
    text?: string;
    ariaLabel?: string;
  }>;
}

export interface ServerOptions {
  wsPort?: number;
  mcpPort?: number;
  skipAuth?: boolean; // For development
}

export class ProxyServer extends EventEmitter {
  private httpServer: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private activeClient: WebSocket | null = null;
  private agentManager: AgentManager;
  private mcpBridge: McpBridge | null;
  private authToken: string;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pendingPermissionAcpIds = new Map<string, number | string>();
  /** From extension hello / settings_sync */
  private clientAgentToolPermission: "ask" | "auto_always" = "ask";
  private lastPong = 0;
  private options: ServerOptions;
  private useDirectControl: boolean;
  private pendingBrowserState = new Map<string, {
    resolve: (state: BrowserStateSnapshot) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(options: ServerOptions = {}) {
    super();
    this.options = options;
    this.useDirectControl = supportsDirectBrowserControl();

    const mcpPort = options.mcpPort || DEFAULT_MCP_PORT;
    const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
    this.agentManager = new AgentManager(mcpUrl);
    this.authToken = getOrCreateAuthToken();

    // MCP bridge is only needed when NOT using direct browser control
    if (this.useDirectControl) {
      this.mcpBridge = null;
      console.log("[Server] Direct browser control mode — MCP bridge disabled");
    } else {
      this.mcpBridge = new McpBridge(mcpPort);
      this.setupMcpEvents();
    }

    this.setupAgentEvents();
  }

  async start(): Promise<void> {
    const wsPort = this.options.wsPort || DEFAULT_WS_PORT;

    // Start MCP bridge only if not using direct browser control
    if (this.mcpBridge) {
      await this.mcpBridge.start();
    }

    // Start HTTP + WebSocket server
    await new Promise<void>((resolve, reject) => {
      this.httpServer = createServer((req, res) => {
        const url = new URL(req.url || "/", `http://localhost`);

        if (url.pathname === "/token") {
          const origin = req.headers.origin || "";
          const isChromeExtension = origin.startsWith("chrome-extension://");
          if (!isChromeExtension) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Forbidden" }));
            return;
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
          });
          res.end(JSON.stringify({ token: this.authToken }));
          return;
        }

        if (req.method === "OPTIONS") {
          const origin = req.headers.origin || "";
          if (origin.startsWith("chrome-extension://")) {
            res.writeHead(204, {
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Max-Age": "86400",
            });
            res.end();
            return;
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            name: "agents-in-browser-proxy",
            version: APP_VERSION,
            status: "running",
          }),
        );
      });

      this.wss = new WebSocketServer({ server: this.httpServer });
      this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) =>
        this.handleConnection(ws, req),
      );

      this.httpServer.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
          console.error(`[Server] Port ${wsPort} already in use`);
        }
        reject(err);
      });

      this.httpServer.listen(wsPort, "127.0.0.1", () => {
        console.log(
          `[Server] WebSocket server listening on ws://127.0.0.1:${wsPort}`,
        );
        console.log(`[Server] Auth token: ${this.authToken}`);
        console.log(
          `[Server] If the extension cannot auto-connect, paste the token above into Settings → Connection.`,
        );
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    await this.agentManager.shutdown();
    this.mcpBridge?.stop();

    if (this.activeClient) {
      this.activeClient.close();
      this.activeClient = null;
    }

    await new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
    await new Promise<void>((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });

    for (const [id, pending] of this.pendingBrowserState) {
      clearTimeout(pending.timer);
      pending.resolve({ activeTab: null, tabs: [] });
      this.pendingBrowserState.delete(id);
    }
  }

  private handleConnection(
    ws: WebSocket,
    req: IncomingMessage,
  ): void {
    // Auth validation
    if (!this.options.skipAuth) {
      if (!validateToken(req.url, this.authToken)) {
        console.warn("[Server] Rejected connection: invalid token");
        ws.close(4002, "Invalid token");
        return;
      }

      // Origin check: allow chrome-extension:// or missing origin (some browsers)
      const origin = req.headers.origin;
      if (origin && !validateOrigin(origin)) {
        console.warn(`[Server] Rejected connection from origin: ${origin}`);
        ws.close(4001, "Invalid origin");
        return;
      }
    }

    // Single connection enforcement
    if (this.activeClient) {
      console.warn(
        "[Server] Rejected connection: another client already connected",
      );
      ws.close(4003, "Another client already connected");
      return;
    }

    this.activeClient = ws;
    console.log("[Server] Client connected");

    ws.on("message", (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString()) as ExtToProxyMessage;
        this.handleMessage(msg).catch((err: unknown) => {
          console.error("[Server] Error handling message:", err);
        });
      } catch (err: unknown) {
        console.error("[Server] Failed to parse message:", err);
      }
    });

    ws.on("close", () => {
      console.log("[Server] Client disconnected");
      this.activeClient = null;
      this.clientAgentToolPermission = "ask";
      this.stopHeartbeat();
    });

    ws.on("error", (err: Error) => {
      console.error("[Server] WebSocket error:", err.message);
    });
  }

  private async handleMessage(msg: ExtToProxyMessage): Promise<void> {
    console.log(`[Server] ← ${msg.type}`, msg.type === "pong" ? "" : JSON.stringify(msg.payload).slice(0, 200));
    switch (msg.type) {
      case "hello":
        this.handleHello(msg.payload);
        break;
      case "settings_sync":
        this.applySettingsSync(msg.payload);
        break;
      case "prompt":
        await this.handlePrompt(msg.payload);
        break;
      case "cancel":
        await this.agentManager.cancel(msg.payload.sessionId);
        break;
      case "switch_agent":
        await this.handleSwitchAgent(msg.payload);
        break;
      case "agent_preflight_check":
        await this.handleAgentPreflightCheck(msg.payload);
        break;
      case "agent_install_request":
        await this.handleAgentInstallRequest(msg.payload);
        break;
      case "new_session":
        await this.handleNewSession();
        break;
      case "permission_response":
        await this.handlePermissionResponse(msg.payload);
        break;
      case "tool_result":
        this.handleBrowserToolResult(msg.payload);
        break;
      case "pong":
        this.lastPong = Date.now();
        break;
      case "browser_state_response":
        this.handleBrowserStateResponse(msg.payload);
        break;

      default:
        console.warn(`[Server] Unknown message type: ${(msg as { type: string }).type}`);
        break;
    }
  }

  private applySettingsSync(payload: { agentToolPermission?: "ask" | "auto_always" }) {
    if (payload.agentToolPermission === undefined) return;
    if (payload.agentToolPermission === "ask" || payload.agentToolPermission === "auto_always") {
      this.clientAgentToolPermission = payload.agentToolPermission;
      console.log(`[Server] agentToolPermission → ${this.clientAgentToolPermission}`);
    }
  }

  private handleHello(payload: {
    clientVersion: string;
    protocolVersion: number;
    agentToolPermission?: "ask" | "auto_always";
  }) {
    if (payload.protocolVersion !== PROTOCOL_VERSION) {
      this.send(
        createMessage("error", {
          code: "PROTOCOL_MISMATCH",
          message: `Unsupported protocol version: ${payload.protocolVersion}, expected ${PROTOCOL_VERSION}`,
        }),
      );
      this.activeClient?.close(4004, "Protocol mismatch");
      return;
    }

    this.applySettingsSync({
      agentToolPermission: payload.agentToolPermission,
    });

    this.send(
      createMessage("hello_ack", {
        serverVersion: APP_VERSION,
        protocolVersion: PROTOCOL_VERSION,
      }),
    );

    this.startHeartbeat();
  }

  private async handlePrompt(payload: PromptPayload): Promise<void> {
    const { sessionId, text, attachments } = payload;

    // Convert chat attachments to ACP attachments
    const acpAttachments: AcpAttachment[] | undefined = attachments?.map(
      (a) => ({
        type: a.type === "image" ? "image" : "text",
        content: a.content,
        mimeType: a.mimeType,
        name: a.preview,
        source: a.source
          ? { url: a.source.url, title: a.source.title }
          : undefined,
      }),
    );

    this.send(
      createMessage("session_state", {
        sessionId,
        state: "active" as const,
      }),
    );

    const autoSnapshot = payload.autoSnapshot !== false;
    let promptText = text;
    if (autoSnapshot) {
      const state = await this.collectBrowserState();
      promptText = `${this.formatBrowserState(state)}\n\n${text}`;
    }

    try {
      await this.agentManager.prompt(
        sessionId,
        promptText,
        acpAttachments,
        (update: AcpSessionUpdate) => {
          this.forwardSessionUpdate(sessionId, update);
        },
      );

      this.send(
        createMessage("session_state", {
          sessionId,
          state: "idle" as const,
        }),
      );
    } catch (err) {
      this.send(
        createMessage("session_state", {
          sessionId,
          state: "error" as const,
          error: (err as Error).message,
        }),
      );
    }
  }

  async collectBrowserState(): Promise<BrowserStateSnapshot> {
    if (!this.activeClient || this.activeClient.readyState !== WebSocket.OPEN) {
      return { activeTab: null, tabs: [] };
    }

    const requestId = `state_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<BrowserStateSnapshot>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingBrowserState.delete(requestId);
        resolve({ activeTab: null, tabs: [] });
      }, 5000);

      this.pendingBrowserState.set(requestId, { resolve, timer });
      this.send(createMessage("browser_state_request", { requestId }));
    });
  }

  private handleBrowserStateResponse(payload: BrowserStateResponsePayload): void {
    const pending = this.pendingBrowserState.get(payload.requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingBrowserState.delete(payload.requestId);
    pending.resolve(payload.state || { activeTab: null, tabs: [] });
  }

  private formatBrowserState(state: BrowserStateSnapshot): string {
    const lines: string[] = ["[BROWSER STATE]"];
    if (state.activeTab) {
      lines.push(
        `Active tab: [${state.activeTab.id ?? "?"}] ${state.activeTab.title || "(untitled)"} — ${state.activeTab.url || ""}`,
      );
    } else {
      lines.push("Active tab: unavailable");
    }

    const interactive = (state.interactiveElements || []).slice(0, 40);
    if (interactive.length > 0) {
      lines.push(
        `Interactive elements: ${interactive
          .map((el) => `[${el.index}] ${el.tag} \"${el.ariaLabel || el.text || ""}\"`)
          .join(" ")}`,
      );
    }

    const tabs = state.tabs || [];
    lines.push(`Open tabs: (${tabs.length} tabs)`);
    for (const tab of tabs.slice(0, 10)) {
      lines.push(`- [${tab.id ?? "?"}] ${tab.title || "(untitled)"} — ${tab.url || ""}`);
    }
    lines.push("[END BROWSER STATE]");
    return lines.join("\n");
  }

  private async handleSwitchAgent(payload: SwitchAgentPayload): Promise<void> {
    const config =
      payload.config || getAgentById(payload.agentId) || PRESET_AGENTS[0];

    try {
      const sessionId = await this.agentManager.switchAgent(config);
      this.send(
        createMessage("session_state", {
          sessionId,
          state: "idle" as const,
        }),
      );
    } catch (err) {
      this.send(
        createMessage("error", {
          code: "AGENT_SWITCH_FAILED",
          message: (err as Error).message,
        }),
      );
    }
  }

  private async handleAgentPreflightCheck(
    payload: AgentPreflightCheckPayload,
  ): Promise<void> {
    const config =
      payload.config || getAgentById(payload.agentId) || PRESET_AGENTS[0];
    const available = isCommandAvailable(config.command, process.env, config.cwd);
    const message = available
      ? `${config.name} is available`
      : config.installInstructions
        ? `${config.name} is not installed. Install required before switching.`
        : `${config.name} is not installed and no automated install instructions are available.`;
    this.send(
      createMessage("agent_preflight_result", {
        agentId: config.id,
        available,
        reason: payload.reason || "manual",
        carryContext: payload.carryContext,
        message,
        missingCommand: available ? undefined : config.command,
        installInstructions: config.installInstructions,
        config,
      }),
    );
  }

  private async handleAgentInstallRequest(
    payload: AgentInstallRequestPayload,
  ): Promise<void> {
    const config =
      payload.config || getAgentById(payload.agentId) || PRESET_AGENTS[0];
    if (!config.installInstructions) {
      this.send(
        createMessage("agent_install_status", {
          agentId: config.id,
          status: "error" as const,
          message: `No install instructions available for ${config.name}.`,
          config,
        }),
      );
      return;
    }

    this.send(
      createMessage("agent_install_status", {
        agentId: config.id,
        status: "installing" as const,
        message: `Installing dependencies for ${config.name}...`,
        installInstructions: config.installInstructions,
        config,
      }),
    );

    const result = await installAgentDependencies(config.installInstructions);
    this.send(
      createMessage("agent_install_status", {
        agentId: config.id,
        status: result.success ? ("installed" as const) : ("error" as const),
        message: result.success
          ? `${config.name} installed successfully.`
          : (result.output || `Failed to install ${config.name}.`),
        installInstructions: config.installInstructions,
        config,
      }),
    );
  }

  private async handleNewSession(): Promise<void> {
    try {
      const sessionId = await this.agentManager.newSession();
      this.send(
        createMessage("session_state", {
          sessionId,
          state: "idle" as const,
        }),
      );
    } catch (err) {
      this.send(
        createMessage("error", {
          code: "SESSION_CREATE_FAILED",
          message: (err as Error).message,
        }),
      );
    }
  }

  private async handlePermissionResponse(
    payload: PermissionResponsePayload,
  ): Promise<void> {
    const acpRequestId = this.pendingPermissionAcpIds.get(payload.requestId);
    this.pendingPermissionAcpIds.delete(payload.requestId);
    await this.agentManager.permissionRespond(
      payload.requestId,
      payload.approved,
      acpRequestId,
      payload.remember,
    );
  }

  private handleBrowserToolResult(payload: ToolResultPayload): void {
    this.mcpBridge?.handleToolResult(
      payload.callId,
      payload.result,
      payload.error,
    );
  }

  private forwardSessionUpdate(
    sessionId: string,
    acpUpdate: AcpSessionUpdate,
  ): void {
    const inner = acpUpdate.update;
    if (!inner) return;

    switch (inner.sessionUpdate) {
      case "agent_message_chunk":
        if (inner.content?.type === "text" && inner.content.text) {
          this.send(
            createMessage("text_delta", { sessionId, text: inner.content.text }),
          );
        }
        break;

      case "tool_call":
        this.send(
          createMessage("tool_call", {
            sessionId,
            callId: inner.toolCallId,
            tool: inner.name,
            args: inner.input,
          }),
        );
        break;

      case "tool_call_update": {
        // Extract tool result from _meta if available
        const toolResponse = (inner._meta as Record<string, Record<string, unknown>>)?.claudeCode?.toolResponse;
        this.send(
          createMessage("tool_result", {
            sessionId,
            callId: inner.toolCallId,
            result: toolResponse,
          }),
        );
        break;
      }

      case "error":
        if (inner.error) {
          this.send(
            createMessage("error", {
              code: inner.error.code,
              message: inner.error.message,
            }),
          );
        }
        break;

      // Silently ignore non-essential updates
      case "agent_thought_chunk":
      case "plan":
      case "current_mode_update":
      case "available_commands_update":
      case "user_message_chunk":
        break;
    }
  }

  private setupAgentEvents(): void {
    this.agentManager.on(
      "agent_state",
      (state: { agentId: string; state: string }) => {
        this.send(createMessage("agent_state", state));
      },
    );

    this.agentManager.on("agent_error", (err: Error) => {
      this.send(
        createMessage("error", {
          code: "AGENT_ERROR",
          message: err.message,
        }),
      );
    });

    this.agentManager.on("permission_request", (params: Record<string, unknown>) => {
      void this.handleIncomingAgentPermission(params);
    });
  }

  private async handleIncomingAgentPermission(params: Record<string, unknown>): Promise<void> {
    const { _acpRequestId, ...rest } = params;

    const toolCall = rest.toolCall as Record<string, unknown> | undefined;
    const meta = toolCall?._meta as Record<string, unknown> | undefined;
    const toolMeta = meta?.claudeCode as Record<string, unknown> | undefined;
    const toolName = (toolMeta?.toolName as string)
      || (toolCall?.title as string)
      || (toolCall?.kind as string)
      || (rest.action as string)
      || "Tool";
    const requestId = rest.requestId as string
      || (toolCall?.toolCallId as string)
      || String(_acpRequestId ?? Date.now());

    const toolInput = (toolCall?.rawInput ?? toolCall?.input ?? rest.details ?? {}) as Record<string, unknown>;

    if (this.clientAgentToolPermission === "auto_always") {
      console.log("[Server] Auto-approving agent tool permission (auto_always)");
      try {
        await this.agentManager.permissionRespond(
          requestId,
          true,
          _acpRequestId as number | string | undefined,
          true,
        );
      } catch (e) {
        console.error("[Server] Auto permission failed:", e);
      }
      return;
    }

    if (_acpRequestId !== undefined) {
      this.pendingPermissionAcpIds.set(
        requestId,
        _acpRequestId as number | string,
      );
    }

    this.send(createMessage("permission_request", {
      requestId,
      action: toolName,
      tool: toolName,
      agentName: this.agentManager.currentAgentName,
      description: toolInput.command
        ? `run: ${String(toolInput.command).slice(0, 120)}`
        : `use ${toolName}`,
      details: toolInput,
      url: rest.url,
    }));
  }

  private setupMcpEvents(): void {
    if (!this.mcpBridge) return;
    this.mcpBridge.on(
      "tool_request",
      (req: { callId: string; tool: string; args: Record<string, unknown> }) => {
        this.send(
          createMessage("browser_tool_request", {
            callId: req.callId,
            tool: req.tool,
            args: req.args,
          }),
        );
      },
    );
  }

  private send(msg: WsMessage): void {
    if (this.activeClient?.readyState === WebSocket.OPEN) {
      console.log(`[Server] → ${msg.type}`);
      this.activeClient.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat(): void {
    this.lastPong = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (Date.now() - this.lastPong > HEARTBEAT_DEAD_MS) {
        console.warn("[Server] Client heartbeat timeout, closing connection");
        this.activeClient?.close(4005, "Heartbeat timeout");
        this.activeClient = null;
        this.stopHeartbeat();
        return;
      }

      this.send(createMessage("ping", { ts: Date.now() }));
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
