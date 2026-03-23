import { useCallback, useRef, useState, type DragEvent } from "react";
import { useChatStore } from "../../store/chatStore";
import MessageList from "./MessageList";
import ReferenceBar from "./ReferenceBar";
import InputArea from "./InputArea";
import EmptyState from "../EmptyState";
import { attachmentsFromFiles } from "./attachmentUtils";

interface ChatPanelProps {
  sendWsMessage: (type: string, payload: Record<string, unknown>) => void;
}

export default function ChatPanel({ sendWsMessage }: ChatPanelProps) {
  const messages = useChatStore((s) => s.messages);
  const addReference = useChatStore((s) => s.addReference);
  const [isDragOverPanel, setIsDragOverPanel] = useState(false);
  const dragDepthRef = useRef(0);

  const hasMessages = messages.length > 0;

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const attachments = await attachmentsFromFiles(files);
      for (const attachment of attachments) {
        addReference(attachment);
      }
    },
    [addReference],
  );

  const onDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOverPanel(true);
  }, []);

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOverPanel(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOverPanel(false);
      void addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}
    >
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {hasMessages ? (
          <MessageList sendWsMessage={sendWsMessage} />
        ) : (
          <EmptyState />
        )}
      </div>

      <div style={{ flexShrink: 0 }}>
        <ReferenceBar />
        <InputArea sendWsMessage={sendWsMessage} />
      </div>

      {isDragOverPanel && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            border: "2px dashed var(--accent)",
            borderRadius: 10,
            background: "rgba(110,231,183,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent)",
            fontSize: 12,
            fontWeight: 600,
            zIndex: 20,
          }}
        >
          Drop files to attach
        </div>
      )}
    </div>
  );
}
