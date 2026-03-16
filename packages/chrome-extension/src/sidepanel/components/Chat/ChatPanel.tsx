import { useChatStore } from "../../store/chatStore";
import MessageList from "./MessageList";
import ReferenceBar from "./ReferenceBar";
import InputArea from "./InputArea";
import EmptyState from "../EmptyState";

interface ChatPanelProps {
  sendWsMessage: (type: string, payload: Record<string, unknown>) => void;
}

export default function ChatPanel({ sendWsMessage }: ChatPanelProps) {
  const messages = useChatStore((s) => s.messages);
  const currentSessionId = useChatStore((s) => s.currentSessionId);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Message area */}
      <div className="flex-1 overflow-hidden relative">
        {hasMessages ? (
          <MessageList sendWsMessage={sendWsMessage} />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Reference bar + Input area */}
      <div className="shrink-0 border-t border-border">
        <ReferenceBar />
        <InputArea sendWsMessage={sendWsMessage} />
      </div>
    </div>
  );
}
