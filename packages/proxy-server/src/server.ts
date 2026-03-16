import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import { AgentManager } from "./agentManager";
import { McpBridge } from "./mcpBridge";
import { getOrCreateAuthToken, validateOrigin, validateToken } from "./auth";
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
} from "@anthropic-ai/acp-browser-shared";
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
} from "@anthropic-ai/acp-browser-shared";

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
  private mcpBridge: McpBridge;
  private authToken: string;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private options: ServerOptions;

  constructor(options: ServerOptions = {}) {
    super();
    this.options = options;
    const mcpPort = options.mcpPort || DEFAULT_MCP_PORT;
    const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
    this.agentManager = new AgentManager(mcpUrl);
    this.mcpBridge = new McpBridge(mcpPort);
    this.authToken = getOrCreateAuthToken();

    this.setupAgentEvents();
    this.setupMcpEvents();
  }

  async start(): Promise<void> {
    const wsPort = this.options.wsPort || DEFAULT_WS_PORT;

    // Start MCP bridge first
    await this.mcpBridge.start();

    // Start HTTP + WebSocket server
    await new Promise<void>((resolve, reject) => {
      this.httpServer = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            name: "acp-browser-proxy",
            version: APP_VERSION,
            status: "running",
          }),
        );
      });

      this.wss = new WebSocketServer({ server: this.httpServer });
      this.wss.on("connection", (ws, req) =>
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
          `[Server] Connect URL: ws://localhost:${wsPort}/?token=${this.authToken}`,
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
    this.mcpBridge.stop();

    if (this.activeClient) {
      this.activeClient.close();
      this.activeClient = null;
    }

    this.wss?.close();
    this.httpServer?.close();
  }

  private handleConnection(
    ws: WebSocket,
    req: import("http").IncomingMessage,
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

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ExtToProxyMessage;
        this.handleMessage(msg);
      } catch (err) {
        console.error("[Server] Failed to parse message:", err);
      }
    });

    ws.on("close", () => {
      console.log("[Server] Client disconnected");
      this.activeClient = null;
      this.stopHeartbeat();
    });

    ws.on("error", (err) => {
      console.error("[Server] WebSocket error:", err.message);
    });
  }

  private async handleMessage(msg: ExtToProxyMessage): Promise<void> {
    console.log(`[Server] ← ${msg.type}`, msg.type === "pong" ? "" : JSON.stringify(msg.payload).slice(0, 200));
    switch (msg.type) {
      case "hello":
        this.handleHello(msg.payload);
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
    }
  }

  private handleHello(payload: { clientVersion: string; protocolVersion: number }) {
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

    try {
      await this.agentManager.prompt(
        sessionId,
        text,
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
    await this.agentManager.permissionRespond(
      payload.requestId,
      payload.approved,
    );
  }

  private handleBrowserToolResult(payload: ToolResultPayload): void {
    this.mcpBridge.handleToolResult(
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
  }

  private setupMcpEvents(): void {
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
