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

/** Agent-side tool permission (e.g. Claude Code Bash): ask user vs auto-approve */
export type AgentToolPermissionMode = "ask" | "auto_always";

export interface HelloPayload {
  clientVersion: string;
  protocolVersion: number;
  /** When `auto_always`, proxy auto-approves session/request_permission without UI */
  agentToolPermission?: AgentToolPermissionMode;
}

export interface SettingsSyncPayload {
  agentToolPermission?: AgentToolPermissionMode;
}

export interface PromptPayload {
  sessionId: string;
  text: string;
  attachments?: ChatAttachment[];
  autoSnapshot?: boolean;
}

export interface BrowserStateResponsePayload {
  requestId: string;
  state: {
    activeTab: { id?: number; url?: string; title?: string } | null;
    tabs: Array<{ id?: number; url?: string; title?: string; active?: boolean }>;
    interactiveElements?: Array<{
      index: number;
      tag: string;
      text?: string;
      ariaLabel?: string;
    }>;
  };
}

export interface CancelPayload {
  sessionId: string;
}

export interface SwitchAgentPayload {
  agentId: string;
  config?: import("./agentConfigs").AgentConfig;
  carryContext?: boolean;
}

export interface AgentPreflightCheckPayload {
  agentId: string;
  config?: import("./agentConfigs").AgentConfig;
  reason?: "auto" | "manual";
  carryContext?: boolean;
}

export interface AgentInstallRequestPayload {
  agentId: string;
  config?: import("./agentConfigs").AgentConfig;
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

export interface ModeTogglePayload {
  skipPermissions: boolean;
}

// Session management commands (Extension -> Proxy)
export interface SessionStatusRequestPayload {
  sessionId: string;
}

export interface ListSessionsRequestPayload {
  all?: boolean;
}

export interface ChangeCwdPayload {
  sessionId: string;
  cwd: string;
}

export interface ChangeModePayload {
  sessionId: string;
  mode: "plan" | "code" | "ask";
}

export interface KeepAlivePayload {
  agentId: string;
}

// Extension -> Proxy message types
export type ExtToProxyMessage =
  | WsMessage<"hello", HelloPayload>
  | WsMessage<"settings_sync", SettingsSyncPayload>
  | WsMessage<"prompt", PromptPayload>
  | WsMessage<"cancel", CancelPayload>
  | WsMessage<"switch_agent", SwitchAgentPayload>
  | WsMessage<"agent_preflight_check", AgentPreflightCheckPayload>
  | WsMessage<"agent_install_request", AgentInstallRequestPayload>
  | WsMessage<"new_session", NewSessionPayload>
  | WsMessage<"permission_response", PermissionResponsePayload>
  | WsMessage<"tool_result", ToolResultPayload>
  | WsMessage<"browser_state_response", BrowserStateResponsePayload>
  | WsMessage<"pong", PongPayload>
  | WsMessage<"mode_toggle", ModeTogglePayload>
  | WsMessage<"session_status_request", SessionStatusRequestPayload>
  | WsMessage<"list_sessions_request", ListSessionsRequestPayload>
  | WsMessage<"change_cwd", ChangeCwdPayload>
  | WsMessage<"change_mode", ChangeModePayload>
  | WsMessage<"keep_alive", KeepAlivePayload>;

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

export interface AgentPreflightResultPayload {
  agentId: string;
  available: boolean;
  reason?: "auto" | "manual";
  carryContext?: boolean;
  message?: string;
  missingCommand?: string;
  installInstructions?: string;
  config?: import("./agentConfigs").AgentConfig;
}

export interface AgentInstallStatusPayload {
  agentId: string;
  status: "installing" | "installed" | "error";
  message: string;
  installInstructions?: string;
  config?: import("./agentConfigs").AgentConfig;
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

export interface BrowserStateRequestPayload {
  requestId: string;
}

export interface ModeStatusPayload {
  skipPermissions: boolean;
  agentId: string;
}

// Session management responses (Proxy -> Extension)
export interface SessionStatusResponsePayload {
  sessionId: string;
  acpSessionId?: string;
  agentId: string;
  cwd: string;
  mode?: string;
  model?: string;
  state: SessionState;
  lastActive: number;
}

export interface ListSessionsResponsePayload {
  sessions: Array<{
    sessionId: string;
    agentId: string;
    name?: string;
    state: string;
    lastActive: number;
    cwd?: string;
  }>;
}

export interface CwdChangedPayload {
  sessionId: string;
  cwd: string;
  newSessionId?: string;
}

export interface ModeChangedPayload {
  sessionId: string;
  mode: string;
  newSessionId?: string;
}

// Proxy -> Extension message types
export type ProxyToExtMessage =
  | WsMessage<"hello_ack", HelloAckPayload>
  | WsMessage<"text_delta", TextDeltaPayload>
  | WsMessage<"tool_call", ToolCallPayload>
  | WsMessage<"tool_result", ToolCallResultPayload>
  | WsMessage<"agent_preflight_result", AgentPreflightResultPayload>
  | WsMessage<"agent_install_status", AgentInstallStatusPayload>
  | WsMessage<"permission_request", PermissionRequestPayload>
  | WsMessage<"session_state", SessionStatePayload>
  | WsMessage<"agent_state", AgentStatePayload>
  | WsMessage<"browser_tool_request", BrowserToolRequestPayload>
  | WsMessage<"browser_state_request", BrowserStateRequestPayload>
  | WsMessage<"ping", PingPayload>
  | WsMessage<"error", ErrorPayload>
  | WsMessage<"mode_status", ModeStatusPayload>
  | WsMessage<"session_status_response", SessionStatusResponsePayload>
  | WsMessage<"list_sessions_response", ListSessionsResponsePayload>
  | WsMessage<"cwd_changed", CwdChangedPayload>
  | WsMessage<"mode_changed", ModeChangedPayload>;

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
