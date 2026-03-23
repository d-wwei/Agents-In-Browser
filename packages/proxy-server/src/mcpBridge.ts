import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { EventEmitter } from "events";
import { BROWSER_TOOLS, BROWSER_TOOL_COUNT } from "@anthropic-ai/agents-in-browser-shared";
import { loadBrowserControlInstructions } from "./skillLoader";

interface PendingToolCall {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * MCP Server (HTTP+SSE) that exposes browser tools to ACP agents.
 * Receives tool calls from agents, forwards them to the Chrome extension
 * via WebSocket, and returns results.
 */
export class McpBridge extends EventEmitter {
  private server: ReturnType<typeof createServer> | null = null;
  private pendingCalls = new Map<string, PendingToolCall>();
  private sseClients = new Set<ServerResponse>();
  private port: number;

  constructor(port: number) {
    super();
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
          console.error(`[MCP] Port ${this.port} already in use`);
        }
        reject(err);
      });

      this.server.listen(this.port, "127.0.0.1", () => {
        console.log(`[MCP] Server listening on http://127.0.0.1:${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();

    for (const [, pending] of this.pendingCalls) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("MCP server stopped"));
    }
    this.pendingCalls.clear();

    this.server?.close();
    this.server = null;
  }

  /** Called when the extension returns a browser tool result */
  handleToolResult(callId: string, result: unknown, error?: string): void {
    const pending = this.pendingCalls.get(callId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingCalls.delete(callId);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // CORS headers for local MCP client — restrict to localhost origins
    const origin = req.headers.origin;
    const allowedOrigin = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : "http://127.0.0.1";
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://localhost:${this.port}`);

    if (req.method === "GET" && url.pathname === "/mcp") {
      // SSE endpoint for MCP streaming
      this.handleSSE(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/mcp") {
      // JSON-RPC endpoint for MCP requests
      await this.handleJsonRpc(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private handleSSE(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    this.sseClients.add(res);

    // Send initial endpoint info
    const endpoint = `http://127.0.0.1:${this.port}/mcp`;
    res.write(`event: endpoint\ndata: ${endpoint}\n\n`);

    _req.on("close", () => {
      this.sseClients.delete(res);
    });
  }

  private async handleJsonRpc(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    let parsed: { id?: number | string; method: string; params?: Record<string, unknown> };

    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const { id, method, params } = parsed;

    if (method === "initialize") {
      this.sendJsonRpcResponse(res, id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: "agents-in-browser-mcp", version: "0.1.0" },
      });
      return;
    }

    if (method === "initialized" || method === "notifications/initialized") {
      // MCP client notification/no-op ack compatibility.
      this.sendJsonRpcResponse(res, id, { ok: true });
      return;
    }

    if (method === "tools/list") {
      const tools = BROWSER_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      if (tools.length !== BROWSER_TOOL_COUNT) {
        console.warn(`[MCP] tools/list mismatch: expected ${BROWSER_TOOL_COUNT}, got ${tools.length}`);
      }
      console.log(`[MCP] tools/list -> ${tools.length} tools`);
      this.sendJsonRpcResponse(res, id, { tools });
      return;
    }

    if (method === "tools/call") {
      const toolName = (params?.name as string) || "";
      const toolArgs = (params?.arguments as Record<string, unknown>) || {};

      const callId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      try {
        const result = await this.executeBrowserTool(
          callId,
          toolName,
          toolArgs,
        );
        this.sendJsonRpcResponse(res, id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
        });
      } catch (err) {
        this.sendJsonRpcResponse(res, id, {
          content: [
            { type: "text", text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        });
      }
      return;
    }

    if (method === "resources/list") {
      this.sendJsonRpcResponse(res, id, {
        resources: [
          {
            uri: "browser://state/active",
            name: "Active browser state",
            description: "Active tab summary and lightweight page read",
            mimeType: "application/json",
          },
          {
            uri: "browser://tabs",
            name: "Open browser tabs",
            description: "All open tabs with metadata",
            mimeType: "application/json",
          },
        ],
      });
      return;
    }

    if (method === "resources/read") {
      const uri = (params?.uri as string) || "";
      try {
        const content = await this.readResource(uri);
        this.sendJsonRpcResponse(res, id, {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(content),
            },
          ],
        });
      } catch (err) {
        this.sendJsonRpcResponse(res, id, null, {
          code: -32602,
          message: `Invalid resource read: ${(err as Error).message}`,
        });
      }
      return;
    }

    if (method === "prompts/list") {
      this.sendJsonRpcResponse(res, id, {
        prompts: [
          {
            name: "browser-control-skill",
            title: "Browser control skill instructions",
            description: "Guidance for index-based browser control and step loop",
          },
        ],
      });
      return;
    }

    if (method === "prompts/get") {
      const name = (params?.name as string) || "";
      if (name !== "browser-control-skill") {
        this.sendJsonRpcResponse(res, id, null, {
          code: -32602,
          message: `Unknown prompt: ${name}`,
        });
        return;
      }

      const instructions = loadBrowserControlInstructions();
      this.sendJsonRpcResponse(res, id, {
        description: "Browser control skill instructions",
        messages: [
          {
            role: "system",
            content: {
              type: "text",
              text: instructions || "[No browser control instructions available]",
            },
          },
        ],
      });
      return;
    }

    // Unknown method
    this.sendJsonRpcResponse(res, id, null, {
      code: -32601,
      message: `Method not found: ${method}`,
    });
  }

  private executeBrowserTool(
    callId: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(callId);
        reject(new Error(`Browser tool '${tool}' timed out after 30s`));
      }, 30_000);

      this.pendingCalls.set(callId, { resolve, reject, timeout });

      // Emit event for the WebSocket server to forward to extension
      this.emit("tool_request", { callId, tool, args });
    });
  }

  private async readResource(uri: string): Promise<unknown> {
    if (uri === "browser://tabs") {
      const callId = `mcp_resource_tabs_${Date.now()}`;
      return await this.executeBrowserTool(callId, "browser_tabs", {});
    }

    if (uri === "browser://state/active") {
      const tabs = (await this.executeBrowserTool(
        `mcp_resource_state_tabs_${Date.now()}`,
        "browser_tabs",
        {},
      )) as Array<{
        id?: number;
        active?: boolean;
        title?: string;
        url?: string;
      }>;

      const active = tabs.find((t) => t.active);
      if (!active?.id) {
        return { activeTab: null, tabs };
      }

      const read = await this.executeBrowserTool(
        `mcp_resource_state_read_${Date.now()}`,
        "browser_read",
        {
          tabId: active.id,
          maxLength: 8000,
          includeInteractiveElements: true,
        },
      );

      return {
        activeTab: {
          id: active.id,
          title: active.title,
          url: active.url,
        },
        tabs,
        read,
      };
    }

    throw new Error(`Unsupported resource URI: ${uri}`);
  }

  private sendJsonRpcResponse(
    res: ServerResponse,
    id: number | string | undefined,
    result: unknown,
    error?: { code: number; message: string },
  ): void {
    const response: Record<string, unknown> = { jsonrpc: "2.0", id };
    if (error) {
      response.error = error;
    } else {
      response.result = result;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error(`Request body too large (>${MAX_BODY_SIZE} bytes)`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
