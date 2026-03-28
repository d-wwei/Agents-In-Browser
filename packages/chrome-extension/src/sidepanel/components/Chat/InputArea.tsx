import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Paperclip, Camera, Send, Square } from "lucide-react";
import { SESSION_TYPING_KEEPALIVE_MS, isSystemCommand } from "@anthropic-ai/agents-in-browser-shared";
import { useChatStore } from "../../store/chatStore";
import { useAgentStore } from "../../store/agentStore";
import { useSettingsStore } from "../../store/settingsStore";
import ShortcutTrigger from "../Shortcuts/ShortcutTrigger";
import { attachmentsFromFiles } from "./attachmentUtils";
import { parseCommand, executeCommand } from "../../commands";

interface InputAreaProps {
  sendWsMessage: (type: string, payload: Record<string, unknown>) => void;
}

export default function InputArea({ sendWsMessage }: InputAreaProps) {
  const [text, setText] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const references = useChatStore((s) => s.references);
  const clearReferences = useChatStore((s) => s.clearReferences);
  const addReference = useChatStore((s) => s.addReference);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelGeneration = useChatStore((s) => s.cancelGeneration);

  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const autoSnapshot = useSettingsStore((s) => s.autoSnapshot);
  const agents = useAgentStore((s) => s.agents);
  const currentAgent = agents.find((a) => a.id === currentAgentId);
  const isConnected = currentAgent?.connectionState === "connected";

  const canSend = text.trim().length > 0 && !isStreaming && isConnected;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "18px";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // System command interception (before canSend — /help, /stop work even when disconnected)
    const parsed = parseCommand(trimmed);
    if (parsed) {
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      await executeCommand(parsed, {
        chatStore: useChatStore.getState(),
        currentAgentId,
        currentAgentIcon: currentAgent?.icon,
        sendWsMessage,
      });
      return;
    }

    // Normal agent message — requires connection
    if (!canSend) return;

    const agentId = currentAgentId;
    const agentIcon = currentAgent?.icon;

    await sendMessage(trimmed, agentId, agentIcon);

    const sessionId =
      useChatStore.getState().acpSessionId ??
      useChatStore.getState().currentSessionId;
    if (!sessionId) return;

    const attachments = references.map((ref) => ({
      id: ref.id,
      type: ref.type,
      content: ref.content,
      mimeType: ref.mimeType,
      source: ref.source,
      preview: ref.preview,
    }));

    sendWsMessage("prompt", {
      sessionId,
      text: trimmed,
      attachments: attachments.length > 0 ? attachments : undefined,
      autoSnapshot,
    });

    setText("");
    clearReferences();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [
    canSend,
    text,
    references,
    sendMessage,
    sendWsMessage,
    currentAgentId,
    currentAgent,
    autoSnapshot,
    clearReferences,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // When shortcut menu is open, let ShortcutTrigger handle Enter/Tab
      if (showShortcuts && (e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void handleSend();
        return;
      }

      if (e.key === "/" && text === "") {
        setShowShortcuts(true);
      }
    },
    [handleSend, text, showShortcuts],
  );

  // Typing keepalive: prevent agent eviction while user is composing
  const keepAliveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);

      if (val === "/" || (val.startsWith("/") && val.length <= 40 && !val.includes(" "))) {
        setShowShortcuts(true);
      } else {
        setShowShortcuts(false);
      }

      // Debounced keepalive signal
      if (val.length > 0 && !keepAliveTimerRef.current) {
        keepAliveTimerRef.current = setTimeout(() => {
          keepAliveTimerRef.current = null;
        }, SESSION_TYPING_KEEPALIVE_MS);
        sendWsMessage("keep_alive", { agentId: currentAgentId });
      }
    },
    [sendWsMessage, currentAgentId],
  );

  const handleStop = useCallback(() => {
    cancelGeneration();
    const sessionId =
      useChatStore.getState().acpSessionId ??
      useChatStore.getState().currentSessionId;
    if (sessionId) {
      sendWsMessage("cancel", { sessionId });
    }
  }, [cancelGeneration, sendWsMessage]);

  const handleShortcutSelect = useCallback((shortcut: string) => {
    setText(shortcut + " ");
    setShowShortcuts(false);
    textareaRef.current?.focus();
  }, []);

  const addFilesAsReferences = useCallback(async (files: FileList | File[]) => {
    const attachments = await attachmentsFromFiles(files);
    for (const attachment of attachments) {
      addReference(attachment);
    }
  }, [addReference]);

  const handleAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        void addFilesAsReferences(e.target.files);
      }
      // Allow selecting the same file again later.
      e.target.value = "";
    },
    [addFilesAsReferences],
  );

  const handleScreenshot = useCallback(() => {
    chrome.runtime?.sendMessage?.({ type: "capture_screenshot" }).catch(() => {});
  }, []);

  // Colored overlay: detect if text starts with a system command
  const commandHighlight = useMemo(() => {
    if (!text.startsWith("/")) return null;
    const spaceIdx = text.indexOf(" ");
    const cmdPart = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
    if (cmdPart && isSystemCommand(cmdPart)) {
      const cmdText = spaceIdx === -1 ? text : text.slice(0, spaceIdx);
      const rest = spaceIdx === -1 ? "" : text.slice(spaceIdx);
      return { cmdText, rest };
    }
    return null;
  }, [text]);

  return (
    <div
      style={{
        position: "relative",
        background: "var(--card)",
        borderTop: "1px solid var(--border)",
        boxShadow: "0 -2px 6px rgba(0,0,0,0.12)",
      }}
    >
      {showShortcuts && (
        <ShortcutTrigger
          filter={text.startsWith("/") ? text.slice(1) : ""}
          onSelect={handleShortcutSelect}
          onClose={() => setShowShortcuts(false)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />

      {/* inputRow — padding [8,12], gap 8, align center */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
        <button
          onClick={handleAttach}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", flexShrink: 0 }}
          aria-label="Attach content"
        >
          <Paperclip size={18} />
        </button>
        <button
          onClick={handleScreenshot}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", flexShrink: 0 }}
          aria-label="Take screenshot"
        >
          <Camera size={18} />
        </button>

        {/* inputField — h=36, cornerRadius 10, bg-input, border, padding [0,12] */}
        <div
          style={{
            flex: 1, position: "relative",
            minHeight: 36, borderRadius: 10,
            background: "var(--bg-input, #1a1d26)",
            border: "1px solid var(--border)",
            padding: "6px 12px",
          }}
        >
          {/* Colored overlay — mirrors textarea text, pointer-events disabled */}
          {commandHighlight && (
            <div
              aria-hidden
              style={{
                position: "absolute", top: 6, left: 12, right: 12, bottom: 6,
                fontSize: 13, fontFamily: "inherit", lineHeight: "1.4",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                pointerEvents: "none", overflow: "hidden",
              }}
            >
              <span style={{ color: "#6ee7b7" }}>{commandHighlight.cmdText}</span>
              <span style={{ color: "var(--foreground)" }}>{commandHighlight.rest}</span>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              !isConnected
                ? "Waiting for connection..."
                : "Type a message..."
            }
            disabled={!isConnected}
            rows={1}
            style={{
              position: "relative",
              width: "100%", fontSize: 13,
              color: commandHighlight ? "transparent" : "var(--foreground)",
              caretColor: "var(--foreground)",
              background: "transparent", resize: "none", outline: "none",
              border: "none", padding: "0", maxHeight: 150,
              fontFamily: "inherit", lineHeight: "1.4",
              overflowY: "auto",
              opacity: !isConnected ? 0.5 : 1,
            }}
            aria-label="Message input"
          />
        </div>

        {isStreaming ? (
          <button
            onClick={handleStop}
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: 6, cursor: "pointer",
              background: "rgba(248,113,113,0.1)", color: "var(--destructive)",
              border: "none", display: "flex", alignItems: "center", justifyContent: "center",
            }}
            aria-label="Stop generation"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={() => void handleSend()}
            disabled={!canSend}
            style={{
              flexShrink: 0, background: "none", border: "none", cursor: canSend ? "pointer" : "default",
              color: canSend ? "var(--accent)" : "var(--muted-foreground)",
              opacity: canSend ? 1 : 0.4, display: "flex",
            }}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
