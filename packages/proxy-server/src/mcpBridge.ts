import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { EventEmitter } from "events";
import { BROWSER_TOOLS, P0_TOOL_NAMES } from "@anthropic-ai/acp-browser-shared";

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
    // CORS headers for local MCP client
    res.setHeader("Access-Control-Allow-Origin", "*");
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
        capabilities: { tools: {} },
        serverInfo: { name: "acp-browser-mcp", version: "0.1.0" },
      });
      return;
    }

    if (method === "tools/list") {
      const tools = BROWSER_TOOLS.filter((t) =>
        P0_TOOL_NAMES.includes(t.name),
      ).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
