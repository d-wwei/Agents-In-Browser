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
} from "@anthropic-ai/agents-in-browser-shared";
import { useChatStore } from "./store/chatStore";
import { useAgentStore } from "./store/agentStore";
import { useSettingsStore } from "./store/settingsStore";
import { usePermissionStore } from "./store/permissionStore";
import TopBar from "./components/TopBar";
import ChatPanel from "./components/Chat/ChatPanel";
import SettingsPanel from "./components/Settings/SettingsPanel";
import SessionList from "./components/SessionList";
import TaskHistoryPanel from "./components/TaskHistory/TaskHistoryPanel";
import PermissionModal from "./components/Permissions/PermissionModal";
import type { SettingsPanelTab } from "./components/Settings/SettingsPanel";

type Panel = "chat" | "settings" | "sessions" | "history";

export default function App() {
  const [activePanel, setActivePanel] = useState<Panel>("chat");
  const [settingsTab, setSettingsTab] = useState<SettingsPanelTab>("general");
  const [skipPermissionsActive, setSkipPermissionsActive] = useState(false);
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
  const permissionRequests = usePermissionStore((s) => s.requests);
  const theme = useSettingsStore((s) => s.theme);
  const agentToolPermission = useSettingsStore((s) => s.agentToolPermission);

  // Initialize stores on mount
  useEffect(() => {
    void useChatStore.getState().init();
    void useSettingsStore.getState().load();
  }, []);

  // Apply theme class to <html> whenever it changes
  useEffect(() => {
    const prefersDark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, [theme]);

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

  // Keep proxy in sync when agent tool permission changes (while connected)
  useEffect(() => {
    if (!settingsLoaded) return;
    sendWsMessage("settings_sync", { agentToolPermission });
  }, [agentToolPermission, settingsLoaded, sendWsMessage]);

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

  const connect = useCallback(async () => {
    // Auto-fetch token from proxy server if not already configured
    const settings = useSettingsStore.getState();
    if (!settings.authToken) {
      try {
        const base = (settings.proxyUrl || DEFAULT_WS_URL).replace(/^ws/, "http");
        const resp = await fetch(`${base}/token`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.token) {
            await settings.setAuthToken(data.token);
          }
        }
      } catch {
        // Auto-fetch failed — user can paste token manually
      }
    }

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
            agentToolPermission: useSettingsStore.getState().agentToolPermission,
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
            void useChatStore.getState().newSession(config.id, config.icon, {
              clearAcpSession: true,
            });
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
            void useChatStore.getState().newSession(pending.agentId, pending.config.icon, {
              clearAcpSession: true,
            });
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
        case "mode_status":
          setSkipPermissionsActive(msg.payload.skipPermissions);
          break;

        // Session management command responses
        case "session_status_response": {
          const p = msg.payload as {
            sessionId: string; acpSessionId?: string; agentId: string;
            cwd: string; mode?: string; state: string; lastActive: number;
          };
          chatState.addSystemMessage(
            [
              `Session: ${p.sessionId.slice(0, 12)}`,
              `Agent: ${p.agentId}`,
              `CWD: ${p.cwd}`,
              `Mode: ${p.mode ?? "default"}`,
              `State: ${p.state}`,
              `Last Active: ${new Date(p.lastActive).toLocaleTimeString()}`,
            ].join("\n"),
            "info",
          );
          break;
        }

        case "list_sessions_response": {
          const p = msg.payload as {
            sessions: Array<{
              sessionId: string; agentId: string; name?: string;
              state: string; lastActive: number; cwd?: string;
            }>;
          };
          if (p.sessions.length === 0) {
            chatState.addSystemMessage("No active bridge sessions.", "info");
          } else {
            const lines = p.sessions.map((s) => {
              const label = s.name || s.sessionId.slice(0, 8);
              const cwd = s.cwd ? ` [${s.cwd}]` : "";
              const time = new Date(s.lastActive).toLocaleTimeString();
              return `  ${label} | ${s.agentId} | ${s.state} | ${time}${cwd}`;
            });
            chatState.addSystemMessage(
              `Bridge Sessions (${p.sessions.length}):\n${lines.join("\n")}`,
              "info",
            );
          }
          break;
        }

        case "cwd_changed": {
          const p = msg.payload as { sessionId: string; cwd: string; newSessionId?: string };
          const sid = chatState.currentSessionId;
          if (sid) void chatState.updateSessionCwd(sid, p.cwd);
          if (p.newSessionId) chatState.setAcpSessionId(p.newSessionId);
          chatState.addSystemMessage(`Working directory changed to: ${p.cwd}`, "success");
          break;
        }

        case "mode_changed": {
          const p = msg.payload as { sessionId: string; mode: string; newSessionId?: string };
          const sid = chatState.currentSessionId;
          if (sid) void chatState.updateSessionMode(sid, p.mode);
          if (p.newSessionId) chatState.setAcpSessionId(p.newSessionId);
          chatState.addSystemMessage(`Mode changed to: ${p.mode}`, "success");
          break;
        }
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
          void connect();
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

    void connect();

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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--background, #0f1117)", color: "var(--foreground, #d1d5db)" }}>
      <TopBar
        activePanel={activePanel}
        onOpenSettings={() => {
          setSettingsTab("general");
          setActivePanel(activePanel === "settings" ? "chat" : "settings");
        }}
        onOpenAgentsSettings={() => {
          setSettingsTab("agents");
          setActivePanel("settings");
        }}
        onOpenSessions={() =>
          setActivePanel(activePanel === "sessions" ? "chat" : "sessions")
        }
        onOpenHistory={() =>
          setActivePanel(activePanel === "history" ? "chat" : "history")
        }
        sendWsMessage={sendWsMessage}
        skipPermissionsActive={skipPermissionsActive}
      />

      {skipPermissionsActive && (
        <div style={{
          background: "var(--destructive, #dc2626)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 600,
          textAlign: "center",
          lineHeight: "24px",
          height: 24,
          flexShrink: 0,
        }}>
          ⚠ 危险模式已开启 — Agent 将跳过所有权限确认
        </div>
      )}

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {activePanel === "chat" && <ChatPanel sendWsMessage={sendWsMessage} />}

        {activePanel === "settings" && (
          <SettingsPanel
            initialTab={settingsTab}
            onClose={() => {
              setActivePanel("chat");
              setSettingsTab("general");
            }}
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

      {preflight && (
        <AgentInstallBanner
          preflight={preflight}
          onDismiss={() => useAgentStore.getState().setPreflight(null)}
        />
      )}

      {permissionRequests.map((req) => (
        <PermissionModal
          key={req.requestId}
          request={req}
          sendWsMessage={sendWsMessage}
        />
      ))}
    </div>
  );
}

function AgentInstallBanner({
  preflight,
  onDismiss,
}: {
  preflight: NonNullable<ReturnType<typeof useAgentStore.getState>["preflight"]>;
  onDismiss: () => void;
}) {
  const isError = preflight.status === "error" || preflight.status === "prompt_install";

  return (
    <div
      className="animate-fade-in"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 60,
      }}
    >
      {/* Backdrop — starts below TopBar (48px) */}
      <div
        onClick={onDismiss}
        style={{
          position: "absolute",
          top: 48,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(15,17,23,0.38)",
        }}
      />

      {/* Card: width 360, padding 20, gap 16, cornerRadius 16 */}
      <div
        style={{
          position: "relative",
          width: "calc(100% - 40px)",
          maxWidth: 360,
          borderRadius: 16,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          background: "#1e2538",
          border: "1px solid rgba(255,255,255,0.19)",
          boxShadow: isError
            ? "0 8px 32px rgba(0,0,0,0.44), 0 0 20px rgba(248,113,113,0.1)"
            : "0 8px 32px rgba(0,0,0,0.44), 0 0 20px rgba(110,231,183,0.1)",
        }}
      >
        {/* Header row: space-between, height auto from 36px icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          {/* Left: icon + name, gap 10 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Icon frame: 36x36, cornerRadius 10 */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isError
                  ? "rgba(248,113,113,0.1)"
                  : "rgba(110,231,183,0.1)",
                flexShrink: 0,
              }}
            >
              {preflight.status === "checking" || preflight.status === "installing" ? (
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              )}
            </div>
            {/* Agent name: DM Sans 15px 600 */}
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 15,
                fontWeight: 600,
                color: "#d1d5db",
              }}
            >
              {preflight.agentName}
            </span>
          </div>

          {/* Close button: 16x16 icon */}
          <button
            onClick={onDismiss}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Message block: vertical, gap 10 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: "100%",
          }}
        >
          {/* Error message: DM Sans 12px, lineHeight 1.5, color #9ca3af */}
          <p
            style={{
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              lineHeight: 1.5,
              color: "#9ca3af",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {preflight.message}
          </p>

          {/* Code block with copy button */}
          {preflight.installInstructions && (
            <div style={{ position: "relative" }}>
              <code
                style={{
                  display: "block",
                  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                  fontSize: 11,
                  color: "#d1d5db",
                  backgroundColor: "#1a1d26",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "10px 40px 10px 12px",
                  wordBreak: "break-all",
                  lineHeight: 1.5,
                }}
              >
                {preflight.installInstructions}
              </code>
              <button
                type="button"
                title="Copy to clipboard"
                onClick={() => {
                  void navigator.clipboard.writeText(preflight.installInstructions!);
                }}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "#9ca3af",
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#e5e7eb"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
