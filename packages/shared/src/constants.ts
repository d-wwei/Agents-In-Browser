// Network
export const DEFAULT_WS_PORT = 9876;
export const DEFAULT_MCP_PORT = 9877;
export const DEFAULT_WS_URL = `ws://localhost:${DEFAULT_WS_PORT}`;
export const DEFAULT_MCP_URL = `http://localhost:${DEFAULT_MCP_PORT}/mcp`;

// WebSocket heartbeat
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_DEAD_MS = 30_000;
export const HEARTBEAT_MISSING_MS = 45_000;

// Reconnection backoff
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
export const RECONNECT_MULTIPLIER = 2;

// Content limits
export const BROWSER_READ_MAX_CHARS = 32_000;
export const BROWSER_EXECUTE_TIMEOUT_MS = 10_000;
export const BROWSER_EXECUTE_MAX_RESULT_BYTES = 1_048_576; // 1MB

// Context carry
export const CONTEXT_CARRY_MAX_MESSAGES = 10;
export const CONTEXT_CARRY_MAX_TOKENS = 4_000;

// Quote to Chat
export const MAX_REFERENCES = 5;
export const REFERENCE_PREVIEW_MAX_CHARS = 100;

// Process guard
export const PROCESS_RESTART_MAX_ATTEMPTS = 5;
export const PROCESS_RESTART_BASE_MS = 1_000;
export const PROCESS_RESTART_MAX_MS = 30_000;

// Agent session resume window
export const SESSION_RESUME_WINDOW_MS = 30 * 60 * 1_000; // 30 minutes

// Protocol
export const PROTOCOL_VERSION = 1;
export const APP_VERSION = "0.1.0";

// Auth
export const AUTH_TOKEN_PATH = "~/.acp-browser-client/auth-token";
export const AUTH_TOKEN_BYTES = 32; // 256-bit
