import { useState, useEffect, useCallback, useRef } from "react";
import {
  DEFAULT_WS_URL,
  PROTOCOL_VERSION,
  APP_VERSION,
  HEARTBEAT_INTERVAL_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  RECONNECT_MULTIPLIER,
  type ProxyToExtMessage,
  type ChatAttachment,
  createMessage,
} from "@anthropic-ai/acp-browser-shared";
import { useChatStore } from "./store/chatStore";
import { useAgentStore } from "./store/agentStore";
import { useSettingsStore } from "./store/settingsStore";
import { usePermissionStore } from "./store/permissionStore";
import TopBar from "./components/TopBar";
import ChatPanel from "./components/Chat/ChatPanel";
import SettingsPanel from "./components/Settings/SettingsPanel";
import SessionList from "./components/SessionList";

type Panel = "chat" | "settings" | "sessions";

export default function App() {
  const [activePanel, setActivePanel] = useState<Panel>("chat");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const intentionalCloseRef = useRef(false);
  const agentStartedRef = useRef(false);

  const proxyUrl = useSettingsStore((s) => s.proxyUrl);
  const authToken = useSettingsStore((s) => s.authToken);
  const settingsLoaded = useSettingsStore((s) => s.loaded);

  // Initialize stores on mount
  useEffect(() => {
    void useChatStore.getState().init();
    void useSettingsStore.getState().load();
  }, []);

  const sendWsMessage = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(createMessage(type, payload)));
      }
    },
    [],
  );

  const connect = useCallback(() => {
    const url = useSettingsStore.getState().getConnectUrl();

    // Clean up previous connection without triggering reconnect
    intentionalCloseRef.current = true;
    if (wsRef.current) {
      wsRef.current.onclose = null; // Remove handler to prevent reconnect race
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear any pending reconnect
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = undefined;
    }

    agentStartedRef.current = false;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    // Reset intentional flag now that new WS is assigned
    intentionalCloseRef.current = false;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;

      // Send hello handshake — do NOT set agent state here,
      // wait for agent_state message from server
      ws.send(
        JSON.stringify(
          createMessage("hello", {
            clientVersion: APP_VERSION,
            protocolVersion: PROTOCOL_VERSION,
          }),
        ),
      );
    };

    ws.onmessage = (event) => {
      let msg: ProxyToExtMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      const chatState = useChatStore.getState();
      const agentState = useAgentStore.getState();
      const currentAgent = agentState.agents.find(
        (a) => a.id === agentState.currentAgentId,
      );

      switch (msg.type) {
        case "hello_ack": {
          // Auto-start the current agent on connection (only once)
          if (currentAgent && !agentStartedRef.current) {
            agentStartedRef.current = true;
            sendWsMessage("switch_agent", {
              agentId: currentAgent.id,
              config: {
                id: currentAgent.id,
                name: currentAgent.name,
                description: currentAgent.description,
                command: currentAgent.command,
                args: currentAgent.args,
                env: currentAgent.env,
                icon: currentAgent.icon,
                isCustom: currentAgent.isCustom,
              },
            });
          }

          // Start heartbeat after successful handshake
          if (heartbeatTimerRef.current) {
            clearInterval(heartbeatTimerRef.current);
          }
          break;
        }

        case "text_delta": {
          const agentId = currentAgent?.id ?? "";
          chatState.appendDelta(
            msg.payload.sessionId,
            msg.payload.text,
            agentId,
            currentAgent?.icon,
          );
          break;
        }

        case "tool_call": {
          const streamingId = chatState.streamingMessageId;
          if (streamingId) {
            chatState.addToolCall(streamingId, {
              callId: msg.payload.callId,
              tool: msg.payload.tool,
              args: msg.payload.args,
            });
          }
          break;
        }

        case "tool_result": {
          const messages = chatState.messages;
          for (const m of messages) {
            if (m.toolCalls?.some((tc) => tc.callId === msg.payload.callId)) {
              chatState.updateToolCall(m.id, msg.payload.callId, {
                result: msg.payload.result,
                error: msg.payload.error,
                status: msg.payload.error ? "error" : "complete",
                endTime: Date.now(),
              });
              break;
            }
          }
          break;
        }

        case "session_state":
          // Store the real ACP session ID from the proxy
          if (msg.payload.sessionId) {
            chatState.setAcpSessionId(msg.payload.sessionId);
          }
          if (msg.payload.state === "idle") {
            chatState.finalizeStream();
          } else if (msg.payload.state === "error") {
            chatState.cancelGeneration();
          }
          break;

        case "agent_state":
          // This is the authoritative source for agent connection state
          agentState.updateAgentState(
            msg.payload.agentId,
            msg.payload.state,
            msg.payload.error,
          );
          break;

        case "ping":
          // Respond to server ping with pong
          ws.send(
            JSON.stringify(createMessage("pong", { ts: msg.payload.ts })),
          );
          break;

        case "error":
          console.error("[WS] Server error:", msg.payload.message);
          break;

        case "browser_tool_request":
          chrome.runtime.sendMessage({
            type: "browser_tool_request",
            callId: msg.payload.callId,
            tool: msg.payload.tool,
            args: msg.payload.args,
          });
          break;

        case "permission_request":
          usePermissionStore.getState().addRequest(msg.payload);
          break;
      }
    };

    ws.onclose = () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = undefined;
      }

      const agentId = useAgentStore.getState().currentAgentId;
      useAgentStore.getState().updateAgentState(agentId, "disconnected");

      // Only auto-reconnect if the close was NOT intentional
      if (!intentionalCloseRef.current) {
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, attempt),
          RECONNECT_MAX_MS,
        );
        reconnectAttemptRef.current = attempt + 1;

        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      // Error will be followed by close event, which handles reconnect
    };
  }, [proxyUrl, authToken, sendWsMessage]);

  useEffect(() => {
    // Don't connect until settings are loaded (to avoid connecting with stale/default token)
    if (!settingsLoaded) return;

    connect();

    const handleMessage = (
      message: { type: string; [key: string]: unknown },
    ) => {
      switch (message.type) {
        case "browser_tool_response": {
          const callId = message.callId as string;
          const result = message.result;
          const error = message.error as string | undefined;
          sendWsMessage("tool_result", { callId, result, error });
          break;
        }
        case "quote_to_chat": {
          useChatStore
            .getState()
            .addReference(message.attachment as ChatAttachment);
          break;
        }
      }
    };

    chrome.runtime?.onMessage?.addListener(handleMessage);

    // Connect to background to receive pending quotes
    let port: chrome.runtime.Port | null = null;
    try {
      port = chrome.runtime.connect({ name: "sidepanel" });
      port.onMessage.addListener(
        (msg: { type: string; attachment?: unknown }) => {
          if (msg.type === "quote_to_chat" && msg.attachment) {
            useChatStore
              .getState()
              .addReference(msg.attachment as ChatAttachment);
          }
        },
      );
    } catch {
      // Background may not be ready
    }

    return () => {
      // Intentional cleanup — don't trigger reconnect
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      chrome.runtime?.onMessage?.removeListener(handleMessage);
      port?.disconnect();
    };
  }, [connect, sendWsMessage, settingsLoaded]);

  return (
    <div className="flex flex-col h-full w-full bg-bg-primary text-text-primary">
      <TopBar
        onOpenSettings={() =>
          setActivePanel(activePanel === "settings" ? "chat" : "settings")
        }
        onOpenSessions={() =>
          setActivePanel(activePanel === "sessions" ? "chat" : "sessions")
        }
        sendWsMessage={sendWsMessage}
      />

      <div className="flex-1 relative overflow-hidden">
        {activePanel === "chat" && <ChatPanel sendWsMessage={sendWsMessage} />}

        {activePanel === "settings" && (
          <SettingsPanel onClose={() => setActivePanel("chat")} />
        )}

        {activePanel === "sessions" && (
          <SessionList onClose={() => setActivePanel("chat")} />
        )}
      </div>
    </div>
  );
}
