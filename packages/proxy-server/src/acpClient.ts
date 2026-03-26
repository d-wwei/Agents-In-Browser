import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  AcpInitializeParams,
  AcpInitializeResult,
  AcpSessionNewResult,
  AcpSessionUpdate,
  AcpMcpServerConfig,
  AcpAttachment,
  AcpPromptChunk,
} from "@anthropic-ai/agents-in-browser-shared";
import { APP_VERSION } from "@anthropic-ai/agents-in-browser-shared";

export interface AcpClientOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export class AcpClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<
    number | string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
    }
  >();
  private buffer = "";
  private _initialized = false;
  private _capabilities: AcpInitializeResult | null = null;

  get initialized() {
    return this._initialized;
  }
  get capabilities() {
    return this._capabilities;
  }
  get pid() {
    return this.process?.pid;
  }
  get running() {
    return this.process !== null && !this.process.killed;
  }

  async start(options: AcpClientOptions): Promise<AcpInitializeResult> {
    if (this.process) {
      await this.stop();
    }

    // Clear CLAUDECODE env var to prevent "nested session" detection
    // when proxy is launched from within a Claude Code session
    const { CLAUDECODE: _cc, ...cleanEnv } = process.env;
    const env = { ...cleanEnv, ...options.env };

    this.process = spawn(options.command, options.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });

    this.process.stdout!.on("data", (data: Buffer) => {
      this.handleData(data.toString());
    });

    this.process.stderr!.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        console.error(`[Agent stderr] ${text}`);
      }
    });

    this.process.on("exit", (code, signal) => {
      this._initialized = false;
      this.rejectAllPending(
        new Error(`Agent exited with code ${code} signal ${signal}`),
      );
      this.emit("exit", code, signal);
    });

    this.process.on("error", (err) => {
      this._initialized = false;
      this.emit("error", err);
    });

    // Initialize
    const result = await this.sendRequest<AcpInitializeResult>("initialize", {
      protocolVersion: 1,
      capabilities: { tools: true, mcp: true },
      clientInfo: { name: "agents-in-browser", version: APP_VERSION },
    } satisfies AcpInitializeParams);

    this._initialized = true;
    this._capabilities = result;
    return result;
  }

  async stop(options?: { force?: boolean }): Promise<void> {
    if (!this.process) return;

    this.rejectAllPending(new Error("Client stopped"));
    this._initialized = false;

    const force = options?.force ?? false;

    return new Promise((resolve) => {
      const proc = this.process!;
      this.process = null;

      if (force) {
        // Immediate SIGKILL for fast switch scenarios
        const safety = setTimeout(resolve, 1000);
        proc.on("exit", () => {
          clearTimeout(safety);
          resolve();
        });
        proc.kill("SIGKILL");
        return;
      }

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 5000);

      proc.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      proc.kill("SIGTERM");
    });
  }

  async sessionNew(
    cwd?: string,
    mcpServers?: AcpMcpServerConfig[],
  ): Promise<string> {
    const result = await this.sendRequest<AcpSessionNewResult>("session/new", {
      cwd: cwd || process.cwd(),
      mcpServers: mcpServers || [],
    });
    return result.sessionId;
  }

  async sessionPrompt(
    sessionId: string,
    text: string,
    mcpServers?: AcpMcpServerConfig[],
    attachments?: AcpAttachment[],
    onUpdate?: (update: AcpSessionUpdate) => void,
  ): Promise<void> {
    // Build prompt content chunks in ACP format
    const prompt: AcpPromptChunk[] = [{ type: "text", text }];

    // Add attachments as additional content chunks
    if (attachments) {
      for (const att of attachments) {
        if (att.type === "image" && att.content) {
          prompt.push({
            type: "image",
            data: att.content.replace(/^data:[^;]+;base64,/, ""),
            mimeType: att.mimeType || "image/png",
          });
        } else if (att.type === "text" && att.content) {
          const source = att.source;
          if (source?.url) {
            prompt.push({
              type: "resource",
              resource: {
                uri: source.url,
                text: att.content,
              },
            });
          } else {
            prompt.push({ type: "text", text: att.content });
          }
        }
      }
    }

    const params = {
      sessionId,
      prompt,
    };

    // Listen for streaming updates
    const updateHandler = (update: AcpSessionUpdate) => {
      if (update.sessionId === sessionId && onUpdate) {
        onUpdate(update);
      }
    };

    this.on("session_update", updateHandler);

    try {
      await this.sendRequest("session/prompt", params as unknown as Record<string, unknown>);
    } finally {
      this.off("session_update", updateHandler);
    }
  }

  async sessionCancel(sessionId: string): Promise<void> {
    await this.sendRequest("session/cancel", { sessionId });
  }

  // Send permission response back to agent
  async permissionRespond(
    requestId: string,
    approved: boolean,
    acpRequestId?: number | string,
    remember?: boolean,
  ): Promise<void> {
    // Reply to the JSON-RPC request (ACP RequestPermissionResponse shape)
    // See @agentclientprotocol/sdk: result = { outcome: { outcome: "selected", optionId } }
    if (acpRequestId !== undefined && this.process?.stdin) {
      let optionId = "reject";
      if (approved && remember) {
        optionId = "allow_always";
      } else if (approved) {
        optionId = "allow";
      }

      const response = JSON.stringify({
        jsonrpc: "2.0",
        id: acpRequestId,
        result: {
          outcome: {
            outcome: "selected",
            optionId,
          },
        },
      }) + "\n";
      console.log("[ACP] Permission response:", optionId, "for request", acpRequestId);
      this.process.stdin.write(response);
      return;
    }

    // Fallback: send as a permission/respond request
    try {
      await this.sendRequest("permission/respond", {
        requestId,
        approved,
      });
    } catch {
      // Ignore errors
    }
  }

  private async sendRequest<T>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error("Agent process not running"));
        return;
      }

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      const data = JSON.stringify(request) + "\n";
      this.process!.stdin!.write(data, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  private static readonly MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

  private handleData(data: string) {
    this.buffer += data;

    if (this.buffer.length > AcpClient.MAX_BUFFER_SIZE) {
      console.error("[ACP] Buffer overflow, truncating");
      const lastNewline = this.buffer.lastIndexOf("\n");
      this.buffer = lastNewline >= 0 ? this.buffer.slice(lastNewline + 1) : "";
    }

    const lines = this.buffer.split("\n");
    // Keep last incomplete line in buffer
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);
        this.handleMessage(msg);
      } catch {
        console.error("[ACP] Failed to parse:", trimmed.slice(0, 200));
      }
    }
  }

  private handleMessage(msg: JsonRpcResponse | JsonRpcNotification) {
    if ("id" in msg && msg.id !== undefined) {
      // Incoming request FROM the agent (has both id AND method)
      // Must check this BEFORE pending requests to avoid id collisions
      if ("method" in msg && (msg as Record<string, unknown>).method) {
        const request = msg as unknown as { id: number | string; method: string; params?: unknown };
        console.log("[ACP] Incoming request:", request.method, JSON.stringify(request.params).slice(0, 300));
        if (request.method === "permission/request" || request.method === "session/request_permission") {
          this.emit("permission_request", {
            ...(request.params as Record<string, unknown>),
            _acpRequestId: request.id,
          });
        }
        return;
      }

      // Response to a request we sent
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if ((msg as JsonRpcResponse).error) {
          console.error("[ACP] Request error:", JSON.stringify((msg as JsonRpcResponse).error));
          pending.reject(
            new Error((msg as JsonRpcResponse).error!.message),
          );
        } else {
          console.log("[ACP] Request result:", JSON.stringify(msg).slice(0, 500));
          pending.resolve((msg as JsonRpcResponse).result);
        }
        return;
      }

      return;
    }

    // Notification (streaming updates, no id)
    const notification = msg as JsonRpcNotification;
    console.log("[ACP] Notification:", notification.method, JSON.stringify(notification.params).slice(0, 300));
    if (notification.method === "session/update") {
      this.emit(
        "session_update",
        notification.params as unknown as AcpSessionUpdate,
      );
    } else if (notification.method === "permission/request") {
      this.emit("permission_request", notification.params);
    }
  }

  private rejectAllPending(err: Error) {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }
}
