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
import TaskHistoryPanel from "./components/TaskHistory/TaskHistoryPanel";

type Panel = "chat" | "settings" | "sessions" | "history";

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
  const preflight = useAgentStore((s) => s.preflight);

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
        return true;
      }
      return false;
    },
    [],
  );

  const requestAgentPreflight = useCallback(
    (
      agent: {
        id: string;
        name: string;
        description: string;
        command: string;
        args: string[];
        env?: Record<string, string>;
        icon?: string;
        isCustom?: boolean;
        installInstructions?: string;
      },
      reason: "auto" | "manual",
      carryContext: boolean,
    ) => {
      const config = {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        command: agent.command,
        args: agent.args,
        env: agent.env,
        icon: agent.icon,
        isCustom: agent.isCustom,
        installInstructions: agent.installInstructions,
      };
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        useAgentStore.getState().setPreflight({
          agentId: agent.id,
          agentName: agent.name,
          config,
          reason,
          carryContext,
          status: "error",
          message: "Proxy is disconnected. Reconnect first, then try switching agents again.",
          installInstructions: agent.installInstructions,
        });
        return;
      }
      useAgentStore.getState().setPreflight({
        agentId: agent.id,
        agentName: agent.name,
        config,
        reason,
        carryContext,
        status: "checking",
        message: `Checking whether ${agent.name} is installed...`,
        installInstructions: agent.installInstructions,
      });
      sendWsMessage("agent_preflight_check", {
        agentId: agent.id,
        config,
        reason,
        carryContext,
      });
    },
    [sendWsMessage],
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
      } catch (err) {
        console.warn("[WS] Failed to parse message:", err);
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
            requestAgentPreflight(currentAgent, "auto", false);
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
          chrome.tabs
            .query({ active: true, currentWindow: true })
            .then(([tab]) =>
              chrome.runtime.sendMessage({
                type: "agent_status_update",
                agentActive: msg.payload.state === "connected",
                activeTabId: tab?.id ?? null,
              }),
            )
            .catch(() => {});
          break;

        case "agent_preflight_result": {
          const pending = useAgentStore.getState().preflight;
          const config =
            msg.payload.config ||
            pending?.config ||
            agentState.agents.find((a) => a.id === msg.payload.agentId);
          if (!config) break;

          if (msg.payload.available) {
            useAgentStore.getState().setPreflight(null);
            useAgentStore.getState().switchAgent(config.id);
            sendWsMessage("switch_agent", {
              agentId: config.id,
              config,
              carryContext: msg.payload.carryContext,
            });
          } else {
            useAgentStore.getState().setPreflight({
              agentId: config.id,
              agentName: config.name,
              config,
              reason: msg.payload.reason || pending?.reason || "manual",
              carryContext: msg.payload.carryContext ?? pending?.carryContext ?? false,
              status: msg.payload.installInstructions ? "prompt_install" : "error",
              message:
                msg.payload.message ||
                `${config.name} is not available on this machine.`,
              installInstructions: msg.payload.installInstructions,
            });
          }
          break;
        }

        case "agent_install_status": {
          const pending = useAgentStore.getState().preflight;
          if (!pending || pending.agentId !== msg.payload.agentId) {
            break;
          }

          if (msg.payload.status === "installed") {
            useAgentStore.getState().setPreflight(null);
            useAgentStore.getState().switchAgent(pending.agentId);
            sendWsMessage("switch_agent", {
              agentId: pending.agentId,
              config: pending.config,
              carryContext: pending.carryContext,
            });
          } else {
            useAgentStore.getState().setPreflight({
              ...pending,
              status:
                msg.payload.status === "installing" ? "installing" : "error",
              message: msg.payload.message,
            });
          }
          break;
        }

        case "ping":
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify(createMessage("pong", { ts: msg.payload.ts })),
            );
          }
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
          }).then((response) => {
            const callId = msg.payload.callId as string;
            const result = response?.result;
            const error = response?.error as string | undefined;
            sendWsMessage("tool_result", { callId, result, error });
          }).catch((error: unknown) => {
            sendWsMessage("tool_result", {
              callId: msg.payload.callId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
          break;

        case "browser_state_request":
          chrome.runtime
            .sendMessage({
              type: "browser_state_request",
              requestId: msg.payload.requestId,
            })
            .then((stateResponse) => {
              sendWsMessage("browser_state_response", {
                requestId: msg.payload.requestId,
                state: stateResponse?.state || { activeTab: null, tabs: [] },
              });
            })
            .catch(() => {
              sendWsMessage("browser_state_response", {
                requestId: msg.payload.requestId,
                state: { activeTab: null, tabs: [] },
              });
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
      chrome.runtime.sendMessage({
        type: "agent_status_update",
        agentActive: false,
        activeTabId: null,
      }).catch(() => {});

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
  }, [proxyUrl, authToken, requestAgentPreflight, sendWsMessage]);

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
        case "browser_state_response": {
          const requestId = message.requestId as string;
          const state = message.state;
          sendWsMessage("browser_state_response", { requestId, state });
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
        onOpenHistory={() =>
          setActivePanel(activePanel === "history" ? "chat" : "history")
        }
        sendWsMessage={sendWsMessage}
      />

      {preflight && (
        <AgentInstallBanner
          preflight={preflight}
          onInstall={() =>
            sendWsMessage("agent_install_request", {
              agentId: preflight.agentId,
              config: preflight.config,
            })
          }
          onDismiss={() => useAgentStore.getState().setPreflight(null)}
        />
      )}

      <div className="flex-1 relative overflow-hidden">
        {activePanel === "chat" && <ChatPanel sendWsMessage={sendWsMessage} />}

        {activePanel === "settings" && (
          <SettingsPanel
            onClose={() => setActivePanel("chat")}
            onReconnect={connect}
          />
        )}

        {activePanel === "sessions" && (
          <SessionList onClose={() => setActivePanel("chat")} />
        )}

        {activePanel === "history" && (
          <TaskHistoryPanel onClose={() => setActivePanel("chat")} />
        )}
      </div>
    </div>
  );
}

function AgentInstallBanner({
  preflight,
  onInstall,
  onDismiss,
}: {
  preflight: NonNullable<ReturnType<typeof useAgentStore.getState>["preflight"]>;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mx-4 mt-2 rounded-xl p-4 shrink-0 relative z-40"
      style={{
        background: "#1e2640",
        border: "1px solid rgba(255,255,255,0.22)",
        borderLeft: "3px solid var(--color-warning)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <div className="text-[13px] font-semibold text-text-primary">
        {preflight.agentName}
      </div>
      <div className="mt-1.5 text-[12px] text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
        {preflight.message}
      </div>
      {preflight.installInstructions && (
        <code
          className="mt-2 block rounded-lg bg-bg-input p-2.5 text-[11px] text-accent break-all"
          style={{ border: "1px solid var(--color-border)" }}
        >
          {preflight.installInstructions}
        </code>
      )}
      <div className="mt-3 flex items-center gap-2.5">
        {preflight.installInstructions && (
          <button
            onClick={onInstall}
            disabled={preflight.status === "installing"}
            className="px-4 h-8 text-[12px] rounded-lg bg-accent hover:bg-accent-hover text-bg-primary font-semibold transition-colors duration-150 disabled:opacity-50"
          >
            {preflight.status === "installing" ? "Installing..." : "Install Agent"}
          </button>
        )}
        <button
          onClick={onDismiss}
          className="px-4 h-8 text-[12px] rounded-lg border border-border text-text-secondary hover:text-text-primary transition-colors duration-150"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
