import { useState, useCallback, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "lucide-react";
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
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group">
      {language && (
        <div className="absolute top-0 left-0 px-2 py-0.5 text-[10px] text-text-muted bg-bg-primary/80 rounded-br rounded-tl-[7px]">
          {language}
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1 text-text-muted bg-bg-primary/80 rounded opacity-0 group-hover:opacity-100 hover:text-text-primary transition-all duration-150 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
        aria-label={copied ? "Copied to clipboard" : "Copy code"}
      >
        {copied ? (
          <Check size={12} aria-hidden="true" />
        ) : (
          <Copy size={12} aria-hidden="true" />
        )}
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
      className={`flex animate-fade-in ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[85%] px-3.5 py-2.5 ${
          isUser
            ? "bg-user-bubble text-text-primary rounded-xl rounded-br-sm"
            : "text-text-primary rounded-xl rounded-bl-sm"
        }`}
        style={{
          background: isUser ? undefined : "#1e2640",
          border: isUser
            ? "1px solid rgba(110,231,183,0.2)"
            : "1px solid rgba(255,255,255,0.22)",
          boxShadow: isUser
            ? "none"
            : "0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
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
          className={`text-[10px] mt-1.5 ${
            isUser ? "text-right" : "text-left"
          } text-text-muted`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
