import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from "react";
import { useChatStore } from "../../store/chatStore";
import { useAgentStore } from "../../store/agentStore";
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

    // sendMessage creates a session if needed, adds the user message, and
    // returns the ChatMessage. It also sets isStreaming = true.
    await sendMessage(trimmed, agentId, agentIcon);

    // Use the real ACP session ID from the proxy, fall back to local session ID
    const sessionId = useChatStore.getState().acpSessionId ?? useChatStore.getState().currentSessionId;

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
    const sessionId = useChatStore.getState().currentSessionId;
    sendWsMessage("cancel", { sessionId });
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
      if (tabs[0]?.id) {
        chrome.tabs.captureVisibleTab(
          tabs[0].windowId!,
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
    <div className="relative bg-bg-secondary">
      {showShortcuts && (
        <ShortcutTrigger
          filter={text.startsWith("/") ? text.slice(1) : ""}
          onSelect={handleShortcutSelect}
          onClose={() => setShowShortcuts(false)}
        />
      )}

      <div className="flex items-end gap-1.5 p-2">
        {/* Attachment button */}
        <button
          onClick={handleAttachment}
          className="p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors shrink-0 mb-0.5"
          title="Attach element from page"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M14 8l-5.5 5.5a3.5 3.5 0 0 1-5-5L9 3a2.5 2.5 0 0 1 3.5 3.5l-5.5 5a1.5 1.5 0 0 1-2-2l5-4.5" />
          </svg>
        </button>

        {/* Screenshot button */}
        <button
          onClick={handleScreenshot}
          className="p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors shrink-0 mb-0.5"
          title="Capture screenshot"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="12" height="9" rx="1.5" />
            <circle cx="8" cy="8.5" r="2.5" />
            <path d="M5.5 4V3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v1" />
          </svg>
        </button>

        {/* Textarea */}
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
          className="flex-1 bg-bg-input text-text-primary text-[13px] placeholder-text-muted rounded-lg px-3 py-2 resize-none outline-none border border-border focus:border-accent transition-colors disabled:opacity-50"
          style={{ maxHeight: 150 }}
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <button
            onClick={handleStop}
            className="p-1.5 rounded bg-error/20 hover:bg-error/30 text-error transition-colors shrink-0 mb-0.5"
            title="Stop generation"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <rect x="4" y="4" width="8" height="8" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="p-1.5 rounded bg-accent hover:bg-accent-hover text-white transition-colors shrink-0 mb-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Send message"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2L7 9" />
              <path d="M14 2L9.5 14L7 9L2 6.5L14 2Z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
