import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from "react";
import { Paperclip, Camera, SendHorizontal, Square } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useAgentStore } from "../../store/agentStore";
import { useSettingsStore } from "../../store/settingsStore";
import ShortcutTrigger from "../Shortcuts/ShortcutTrigger";

interface InputAreaProps {
  sendWsMessage: (type: string, payload: Record<string, unknown>) => void;
}

export default function InputArea({ sendWsMessage }: InputAreaProps) {
  const [text, setText] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const references = useChatStore((s) => s.references);
  const clearReferences = useChatStore((s) => s.clearReferences);
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
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const agentId = currentAgentId;
    const agentIcon = currentAgent?.icon;

    await sendMessage(trimmed, agentId, agentIcon);

    const sessionId = useChatStore.getState().acpSessionId ?? useChatStore.getState().currentSessionId;
    if (!sessionId) {
      console.warn("[InputArea] No session ID available, skipping prompt");
      return;
    }

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
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
        return;
      }

      if (e.key === "/" && text === "") {
        setShowShortcuts(true);
      }
    },
    [handleSend, text],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);

      if (val === "/" || (val.startsWith("/") && val.length <= 20)) {
        setShowShortcuts(true);
      } else {
        setShowShortcuts(false);
      }
    },
    [],
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

  const handleAttachment = useCallback(() => {
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "pick_element" });
      }
    });
  }, []);

  const handleScreenshot = useCallback(() => {
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && tabs[0]?.windowId !== undefined) {
        chrome.tabs.captureVisibleTab(
          tabs[0].windowId,
          { format: "png" },
          (dataUrl) => {
            if (dataUrl) {
              useChatStore.getState().addReference({
                id: crypto.randomUUID(),
                type: "image",
                content: dataUrl,
                preview: "Screenshot",
                mimeType: "image/png",
              });
            }
          },
        );
      }
    });
  }, []);

  return (
    <div
      className="relative"
      style={{
        background: "#1e2640",
        borderTop: "1px solid rgba(255,255,255,0.22)",
        boxShadow: "0 -2px 8px rgba(0,0,0,0.4)",
      }}
    >
      {showShortcuts && (
        <ShortcutTrigger
          filter={text.startsWith("/") ? text.slice(1) : ""}
          onSelect={handleShortcutSelect}
          onClose={() => setShowShortcuts(false)}
        />
      )}

      <div className="flex items-end" style={{ gap: 8, padding: "8px 12px" }}>
        <button
          onClick={handleAttachment}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors duration-150 shrink-0 mb-0.5 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          aria-label="Attach element from page"
        >
          <Paperclip size={18} aria-hidden="true" />
        </button>

        <button
          onClick={handleScreenshot}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors duration-150 shrink-0 mb-0.5 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          aria-label="Capture screenshot"
        >
          <Camera size={18} aria-hidden="true" />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            !isConnected
              ? "Waiting for connection..."
              : "Type a message... (/ for shortcuts)"
          }
          disabled={!isConnected}
          rows={1}
          className="flex-1 bg-bg-input text-text-primary text-[13px] placeholder-text-muted rounded-[10px] px-3 py-2 resize-none outline-none border border-border focus:border-accent/40 transition-colors duration-150 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent/30"
          style={{ height: 36, maxHeight: 150 }}
          aria-label="Message input"
        />

        {isStreaming ? (
          <button
            onClick={handleStop}
            className="p-1.5 rounded-lg bg-error/15 hover:bg-error/25 text-error transition-colors duration-150 shrink-0 mb-0.5 focus-visible:ring-2 focus-visible:ring-error/50 outline-none"
            aria-label="Stop generation"
          >
            <Square size={18} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="p-1.5 rounded-lg text-accent hover:text-accent-hover transition-colors duration-150 shrink-0 mb-0.5 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
            aria-label="Send message"
          >
            <SendHorizontal size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
