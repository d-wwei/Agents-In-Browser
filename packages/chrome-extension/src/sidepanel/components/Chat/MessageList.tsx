import { useRef, useEffect, useState, useCallback } from "react";
import {
  useChatStore,
  type ChatMessage,
  type ToolCallInfo,
} from "../../store/chatStore";
import MessageBubble from "./MessageBubble";
import ToolCallDisplay, { ToolCallSummary, PendingToolCallGroup } from "./ToolCallDisplay";

interface MessageListProps {
  sendWsMessage: (type: string, payload: Record<string, unknown>) => void;
}

export default function MessageList({ sendWsMessage }: MessageListProps) {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessage(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 60;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
    if (atBottom) setHasNewMessage(false);
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setHasNewMessage(true);
    }
  }, [messages, isAtBottom]);

  const renderItems: Array<
    | { kind: "message"; message: ChatMessage }
    | { kind: "toolCall"; toolCall: ToolCallInfo }
    | { kind: "toolCallSummary"; messageId: string; toolCalls: ToolCallInfo[] }
    | { kind: "pendingGroup"; messageId: string; toolCalls: ToolCallInfo[] }
  > = [];

  const hasVisibleToolDetails = (tc: ToolCallInfo): boolean => {
    const hasArgs =
      tc.args &&
      Object.keys(tc.args).length > 0 &&
      JSON.stringify(tc.args) !== "{}";
    const hasResult = tc.result !== undefined;
    const hasError = Boolean(tc.error);
    return hasArgs || hasResult || hasError;
  };

  for (const message of messages) {
    renderItems.push({ kind: "message", message });
    if (message.toolCalls) {
      const pendingOrError: ToolCallInfo[] = [];
      const completed: ToolCallInfo[] = [];

      for (const tc of message.toolCalls) {
        if (tc.status === "complete" && !hasVisibleToolDetails(tc)) {
          continue;
        }
        if (tc.status === "complete") {
          completed.push(tc);
        } else {
          pendingOrError.push(tc);
        }
      }

      // Aggregate pending/error tool calls: 1 item shown solo, 2+ grouped
      if (pendingOrError.length === 1) {
        renderItems.push({ kind: "toolCall", toolCall: pendingOrError[0] });
      } else if (pendingOrError.length > 1) {
        renderItems.push({
          kind: "pendingGroup",
          messageId: message.id,
          toolCalls: pendingOrError,
        });
      }

      if (completed.length > 0) {
        renderItems.push({
          kind: "toolCallSummary",
          messageId: message.id,
          toolCalls: completed,
        });
      }
    }
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{ height: "100%", overflowY: "auto", padding: 12 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {renderItems.map((item) => {
          if (item.kind === "toolCall") {
            return (
              <ToolCallDisplay
                key={`tc-${item.toolCall.callId}`}
                toolCall={item.toolCall}
              />
            );
          }
          if (item.kind === "pendingGroup") {
            return (
              <PendingToolCallGroup
                key={`pg-${item.messageId}`}
                toolCalls={item.toolCalls}
              />
            );
          }
          if (item.kind === "toolCallSummary") {
            return (
              <ToolCallSummary
                key={`tcs-${item.messageId}`}
                toolCalls={item.toolCalls}
              />
            );
          }
          return (
            <MessageBubble key={item.message.id} message={item.message} />
          );
        })}

        {isStreaming && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 14px",
                borderRadius: "12px 12px 12px 4px",
                background: "var(--card, #1e2538)",
                border: "1px solid rgba(255,255,255,0.19)",
              }}
            >
              <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#6b7280", opacity: 0.8 }} />
              <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#6b7280", opacity: 0.5, animationDelay: "0.2s" }} />
              <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#6b7280", opacity: 0.3, animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
      </div>

      <div ref={bottomRef} />

      {hasNewMessage && !isAtBottom && (
        <button
          onClick={scrollToBottom}
          style={{
            position: "sticky", bottom: 12, left: "50%", transform: "translateX(-50%)",
            padding: "6px 12px", borderRadius: 999, border: "none",
            background: "#6ee7b7", color: "#0f1117",
            fontSize: 11, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 10,
          }}
        >
          New messages
        </button>
      )}
    </div>
  );
}
