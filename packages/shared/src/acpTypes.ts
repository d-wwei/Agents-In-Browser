// ACP (Agent Client Protocol) JSON-RPC types over stdio
// Aligned with @agentclientprotocol/sdk v1

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Initialize
export interface AcpInitializeParams {
  protocolVersion: number;
  capabilities: AcpClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface AcpClientCapabilities {
  tools?: boolean;
  mcp?: boolean;
}

export interface AcpInitializeResult {
  protocolVersion: number;
  agentCapabilities?: {
    promptCapabilities?: { image?: boolean; embeddedContext?: boolean };
    mcpCapabilities?: { http?: boolean; sse?: boolean };
    loadSession?: boolean;
    sessionCapabilities?: Record<string, unknown>;
  };
  agentInfo: {
    name: string;
    title?: string;
    version: string;
  };
  authMethods?: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

export interface AcpAgentCapabilities {
  tools?: boolean;
  streaming?: boolean;
  mcp?: boolean;
}

// Session
export interface AcpSessionNewParams {
  cwd: string;
  mcpServers: AcpMcpServerConfig[];
  _meta?: Record<string, unknown>;
}

export interface AcpSessionNewResult {
  sessionId: string;
}

export interface AcpMcpServerConfig {
  name: string;
  type: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  env?: Array<{ name: string; value: string }>;
  headers?: Array<{ name: string; value: string }>;
  tools?: string[];
}

// Prompt content chunk types (ACP SDK format)
export interface AcpTextChunk {
  type: "text";
  text: string;
}

export interface AcpImageChunk {
  type: "image";
  data?: string; // base64
  mimeType?: string;
  uri?: string;
}

export interface AcpResourceChunk {
  type: "resource";
  resource: {
    uri: string;
    text?: string;
    blob?: string;
    mimeType?: string;
  };
}

export type AcpPromptChunk = AcpTextChunk | AcpImageChunk | AcpResourceChunk;

export interface AcpSessionPromptParams {
  sessionId: string;
  prompt: AcpPromptChunk[];
}

export interface AcpAttachment {
  type: "text" | "image" | "file";
  content: string;
  mimeType?: string;
  name?: string;
  source?: {
    url?: string;
    title?: string;
  };
}

// Session update events (streamed from agent via notifications)
// Real ACP format: { sessionId, update: { sessionUpdate: "...", ... } }
export type AcpSessionUpdateKind =
  | "agent_message_chunk"
  | "user_message_chunk"
  | "agent_thought_chunk"
  | "tool_call"
  | "tool_call_update"
  | "plan"
  | "current_mode_update"
  | "available_commands_update"
  | "error";

export interface AcpSessionUpdateContent {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface AcpSessionUpdateInner {
  sessionUpdate: AcpSessionUpdateKind;
  content?: AcpSessionUpdateContent;
  // tool_call fields
  toolCallId?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_call_update fields
  _meta?: Record<string, unknown>;
  // error fields
  error?: {
    code: string;
    message: string;
  };
  // generic catch-all
  [key: string]: unknown;
}

export interface AcpSessionUpdate {
  sessionId: string;
  update: AcpSessionUpdateInner;
}

export interface AcpSessionCancelParams {
  sessionId: string;
}
