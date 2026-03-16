// WebSocket message envelope (Extension <-> Proxy Server)

export interface WsMessage<T extends string = string, P = unknown> {
  version: 1;
  type: T;
  payload: P;
  ts?: number;
}

// ============================
// Extension -> Proxy messages
// ============================

export interface HelloPayload {
  clientVersion: string;
  protocolVersion: number;
}

export interface PromptPayload {
  sessionId: string;
  text: string;
  attachments?: ChatAttachment[];
}

export interface CancelPayload {
  sessionId: string;
}

export interface SwitchAgentPayload {
  agentId: string;
  config?: import("./agentConfigs").AgentConfig;
  carryContext?: boolean;
}

export interface NewSessionPayload {}

export interface PermissionResponsePayload {
  requestId: string;
  approved: boolean;
  remember?: boolean; // "always allow" for this site
}

export interface ToolResultPayload {
  callId: string;
  result: unknown;
  error?: string;
}

export interface PongPayload {
  ts: number;
}

// Extension -> Proxy message types
export type ExtToProxyMessage =
  | WsMessage<"hello", HelloPayload>
  | WsMessage<"prompt", PromptPayload>
  | WsMessage<"cancel", CancelPayload>
  | WsMessage<"switch_agent", SwitchAgentPayload>
  | WsMessage<"new_session", NewSessionPayload>
  | WsMessage<"permission_response", PermissionResponsePayload>
  | WsMessage<"tool_result", ToolResultPayload>
  | WsMessage<"pong", PongPayload>;

// ============================
// Proxy -> Extension messages
// ============================

export interface HelloAckPayload {
  serverVersion: string;
  protocolVersion: number;
}

export interface TextDeltaPayload {
  sessionId: string;
  text: string;
}

export interface ToolCallPayload {
  sessionId: string;
  callId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolCallResultPayload {
  sessionId: string;
  callId: string;
  result: unknown;
  error?: string;
}

export interface PermissionRequestPayload {
  requestId: string;
  action: string;
  details: Record<string, unknown>;
  url?: string;
}

export type SessionState = "active" | "idle" | "error";

export interface SessionStatePayload {
  sessionId: string;
  state: SessionState;
  error?: string;
}

export type AgentConnectionState =
  | "starting"
  | "connected"
  | "disconnected"
  | "error";

export interface AgentStatePayload {
  agentId: string;
  state: AgentConnectionState;
  error?: string;
}

export interface BrowserToolRequestPayload {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface PingPayload {
  ts: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// Proxy -> Extension message types
export type ProxyToExtMessage =
  | WsMessage<"hello_ack", HelloAckPayload>
  | WsMessage<"text_delta", TextDeltaPayload>
  | WsMessage<"tool_call", ToolCallPayload>
  | WsMessage<"tool_result", ToolCallResultPayload>
  | WsMessage<"permission_request", PermissionRequestPayload>
  | WsMessage<"session_state", SessionStatePayload>
  | WsMessage<"agent_state", AgentStatePayload>
  | WsMessage<"browser_tool_request", BrowserToolRequestPayload>
  | WsMessage<"ping", PingPayload>
  | WsMessage<"error", ErrorPayload>;

// ============================
// Shared types
// ============================

export interface ChatAttachment {
  id: string;
  type: "text" | "image" | "element" | "page";
  content: string;
  mimeType?: string;
  source?: {
    url: string;
    title: string;
    selector?: string;
  };
  preview: string;
}

// Helper to create messages
export function createMessage<T extends string, P>(
  type: T,
  payload: P,
): WsMessage<T, P> {
  return { version: 1, type, payload, ts: Date.now() };
}
