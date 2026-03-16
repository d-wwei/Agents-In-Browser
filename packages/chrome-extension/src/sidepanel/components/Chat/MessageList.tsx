import { useRef, useEffect, useState, useCallback } from "react";
import {
  useChatStore,
  type ChatMessage,
  type ToolCallInfo,
} from "../../store/chatStore";
import { usePermissionStore } from "../../store/permissionStore";
import MessageBubble from "./MessageBubble";
import ToolCallDisplay from "./ToolCallDisplay";
import PermissionModal from "../Permissions/PermissionModal";

interface MessageListProps {
  sendWsMessage: (type: string, payload: Record<string, unknown>) => void;
}

export default function MessageList({ sendWsMessage }: MessageListProps) {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const permissionRequests = usePermissionStore((s) => s.requests);
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

  // Auto-scroll when new content arrives and user is at bottom
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setHasNewMessage(true);
    }
  }, [messages, permissionRequests, isAtBottom]);

  // Build a flat render list: messages interleaved with their tool calls
  const renderItems: Array<
    | { kind: "message"; message: ChatMessage }
    | { kind: "toolCall"; toolCall: ToolCallInfo }
  > = [];

  for (const message of messages) {
    renderItems.push({ kind: "message", message });
    if (message.toolCalls) {
      for (const tc of message.toolCalls) {
        renderItems.push({ kind: "toolCall", toolCall: tc });
      }
    }
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto px-3 py-3"
    >
      <div className="flex flex-col gap-1">
        {renderItems.map((item) => {
          if (item.kind === "toolCall") {
            return (
              <ToolCallDisplay
                key={`tc-${item.toolCall.callId}`}
                toolCall={item.toolCall}
              />
            );
          }
          return (
            <MessageBubble key={item.message.id} message={item.message} />
          );
        })}

        {/* Permission requests rendered inline at the end of messages */}
        {permissionRequests.map((req) => (
          <PermissionModal
            key={req.requestId}
            request={req}
            sendWsMessage={sendWsMessage}
          />
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
              <span
                className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
          </div>
        )}
      </div>

      <div ref={bottomRef} />

      {/* New message indicator */}
      {hasNewMessage && !isAtBottom && (
        <button
          onClick={scrollToBottom}
          className="sticky bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-accent text-white text-[11px] rounded-full shadow-lg hover:bg-accent-hover transition-colors z-10"
        >
          New messages
        </button>
      )}
    </div>
  );
}
