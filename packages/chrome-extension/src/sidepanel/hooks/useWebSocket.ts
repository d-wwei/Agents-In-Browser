import { useEffect, useRef, useCallback, useState } from "react";
import {
  APP_VERSION,
  PROTOCOL_VERSION,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MISSING_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  RECONNECT_MULTIPLIER,
  createMessage,
  type WsMessage,
  type ProxyToExtMessage,
  type HelloAckPayload,
  type TextDeltaPayload,
  type ToolCallPayload,
  type ToolCallResultPayload,
  type PermissionRequestPayload,
  type SessionStatePayload,
  type AgentStatePayload,
  type PingPayload,
  type ErrorPayload,
} from "@anthropic-ai/acp-browser-shared";
import { useChatStore } from "../store/chatStore";
import { useAgentStore } from "../store/agentStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WsConnectionState =
  | "disconnected"
  | "connecting"
  | "handshaking"
  | "connected"
  | "reconnecting";

export interface UseWebSocketReturn {
  connectionState: WsConnectionState;
  send: <T extends string, P>(type: T, payload: P) => void;
  connect: (url: string, authToken?: string) => void;
  disconnect: () => void;
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPongRef = useRef<number>(Date.now());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlRef = useRef<string>("");
  const authTokenRef = useRef<string | undefined>(undefined);
  const intentionalCloseRef = useRef(false);

  const [connectionState, setConnectionState] = useState<WsConnectionState>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);

  // Store references (stable selectors)
  const appendDelta = useChatStore((s) => s.appendDelta);
  const finalizeStream = useChatStore((s) => s.finalizeStream);
  const addToolCall = useChatStore((s) => s.addToolCall);
  const updateToolCall = useChatStore((s) => s.updateToolCall);
  const cancelGeneration = useChatStore((s) => s.cancelGeneration);
  const updateAgentState = useAgentStore((s) => s.updateAgentState);

  // Keep mutable ref for the streaming message id
  const streamingMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    return useChatStore.subscribe((state) => {
      streamingMsgIdRef.current = state.streamingMessageId;
    });
  }, []);

  // ----------------------------------
  // Message dispatcher
  // ----------------------------------
  const handleMessage = useCallback(
    (raw: string) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      switch (msg.type) {
        case "hello_ack": {
          const _payload = msg.payload as HelloAckPayload;
          setConnectionState("connected");
          reconnectAttemptRef.current = 0;
          setLastError(null);
          break;
        }

        case "text_delta": {
          const p = msg.payload as TextDeltaPayload;
          const agent = useAgentStore.getState();
          const agentConfig = agent.agents.find((a) => a.id === agent.currentAgentId);
          appendDelta(p.sessionId, p.text, agent.currentAgentId, agentConfig?.icon);
          break;
        }

        case "tool_call": {
          const p = msg.payload as ToolCallPayload;
          const msgId = streamingMsgIdRef.current;
          if (msgId) {
            addToolCall(msgId, { callId: p.callId, tool: p.tool, args: p.args });
          }
          break;
        }

        case "tool_result": {
          const p = msg.payload as ToolCallResultPayload;
          // Find message containing this tool call
          const messages = useChatStore.getState().messages;
          const targetMsg = messages.find((m) =>
            m.toolCalls?.some((tc) => tc.callId === p.callId),
          );
          if (targetMsg) {
            updateToolCall(targetMsg.id, p.callId, {
              status: p.error ? "error" : "complete",
              result: p.result,
              error: p.error,
              endTime: Date.now(),
            });
          }
          break;
        }

        case "permission_request": {
          const _p = msg.payload as PermissionRequestPayload;
          // Permission requests are handled by the Permissions component
          // Dispatch a custom event so the UI can pick it up
          window.dispatchEvent(
            new CustomEvent("acp:permission_request", { detail: _p }),
          );
          break;
        }

        case "session_state": {
          const p = msg.payload as SessionStatePayload;
          if (p.state === "idle") {
            finalizeStream();
          } else if (p.state === "error") {
            cancelGeneration();
            setLastError(p.error ?? "Session error");
          }
          break;
        }

        case "agent_state": {
          const p = msg.payload as AgentStatePayload;
          updateAgentState(p.agentId, p.state, p.error);
          break;
        }

        case "ping": {
          const p = msg.payload as PingPayload;
          lastPongRef.current = Date.now();
          sendRaw(createMessage("pong", { ts: p.ts }));
          break;
        }

        case "error": {
          const p = msg.payload as ErrorPayload;
          setLastError(`[${p.code}] ${p.message}`);
          break;
        }
      }
    },
    [appendDelta, finalizeStream, addToolCall, updateToolCall, cancelGeneration, updateAgentState],
  );

  // ----------------------------------
  // Raw send
  // ----------------------------------
  const sendRaw = useCallback((data: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  // ----------------------------------
  // Public send
  // ----------------------------------
  const send = useCallback(
    <T extends string, P>(type: T, payload: P) => {
      sendRaw(createMessage(type, payload));
    },
    [sendRaw],
  );

  // ----------------------------------
  // Heartbeat monitor
  // ----------------------------------
  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    lastPongRef.current = Date.now();
    heartbeatTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastPongRef.current;
      if (elapsed > HEARTBEAT_MISSING_MS) {
        // Connection is dead, force reconnect
        wsRef.current?.close();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  // ----------------------------------
  // Reconnect with exponential backoff
  // ----------------------------------
  const scheduleReconnect = useCallback(() => {
    if (intentionalCloseRef.current) return;
    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, attempt),
      RECONNECT_MAX_MS,
    );
    reconnectAttemptRef.current = attempt + 1;
    setConnectionState("reconnecting");

    reconnectTimerRef.current = setTimeout(() => {
      connectInternal(urlRef.current, authTokenRef.current);
    }, delay);
  }, []);

  // ----------------------------------
  // Core connect logic
  // ----------------------------------
  const connectInternal = useCallback(
    (url: string, authToken?: string) => {
      // Cleanup previous
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close();
        }
      }

      setConnectionState("connecting");

      const wsUrl = authToken ? `${url}?token=${encodeURIComponent(authToken)}` : url;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState("handshaking");
        sendRaw(
          createMessage("hello", {
            clientVersion: APP_VERSION,
            protocolVersion: PROTOCOL_VERSION,
          }),
        );
        startHeartbeat();
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          handleMessage(event.data);
        }
      };

      ws.onclose = () => {
        stopHeartbeat();
        if (!intentionalCloseRef.current) {
          scheduleReconnect();
        } else {
          setConnectionState("disconnected");
        }
      };

      ws.onerror = () => {
        setLastError("WebSocket connection error");
      };
    },
    [sendRaw, handleMessage, startHeartbeat, stopHeartbeat, scheduleReconnect],
  );

  // ----------------------------------
  // Public connect / disconnect
  // ----------------------------------
  const connect = useCallback(
    (url: string, authToken?: string) => {
      intentionalCloseRef.current = false;
      urlRef.current = url;
      authTokenRef.current = authToken;
      reconnectAttemptRef.current = 0;
      connectInternal(url, authToken);
    },
    [connectInternal],
  );

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    reconnectAttemptRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopHeartbeat();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState("disconnected");
  }, [stopHeartbeat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopHeartbeat();
      wsRef.current?.close();
    };
  }, [stopHeartbeat]);

  return { connectionState, send, connect, disconnect, lastError };
}
