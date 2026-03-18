import { useState, useCallback, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAgentStore } from "../../store/agentStore";
import type { ChatMessage } from "../../store/chatStore";

interface MessageBubbleProps {
  message: ChatMessage;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");
  const language = className?.replace("language-", "") || "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).catch(() => {
      // Clipboard API may not be available
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group">
      {language && (
        <div className="absolute top-0 left-0 px-2 py-0.5 text-[10px] text-text-muted bg-bg-secondary rounded-br rounded-tl-[5px]">
          {language}
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] text-text-muted bg-bg-secondary rounded opacity-0 group-hover:opacity-100 hover:text-text-primary transition-all"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className={className}>
        <code className={className}>{code}</code>
      </pre>
    </div>
  );
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-2 animate-fade-in ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {/* Agent icon */}
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-bg-secondary flex items-center justify-center text-[12px] shrink-0 mt-1">
          {message.agentIcon || "🤖"}
        </div>
      )}

      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isUser
            ? "bg-user-bubble text-text-primary"
            : "bg-agent-bubble text-text-primary"
        }`}
      >
        {/* Attachments preview */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {message.attachments.map((att) => (
              <span
                key={att.id}
                className="inline-flex items-center gap-1 text-[10px] bg-bg-primary/30 rounded px-1.5 py-0.5 text-text-secondary"
              >
                {att.type === "image" ? (
                  <img
                    src={att.content}
                    alt="attachment"
                    className="w-4 h-4 rounded object-cover"
                  />
                ) : (
                  <span className="truncate max-w-[100px]">{att.preview}</span>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="markdown-body text-[13px] leading-relaxed break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const isInline =
                  !className &&
                  typeof children === "string" &&
                  !children.includes("\n");
                if (isInline) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <CodeBlock className={className}>{children}</CodeBlock>
                );
              },
              pre({ children }) {
                return <>{children}</>;
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        <div
          className={`text-[11px] mt-1 ${
            isUser ? "text-right" : "text-left"
          } text-text-muted`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
