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
    <div style={{ position: "relative" }}>
      {language && (
        <div style={{
          position: "absolute", top: 0, left: 0, padding: "2px 8px",
          fontSize: 10, color: "#6b7280", background: "var(--card, #1e2538)",
          borderBottomRightRadius: 4, borderTopLeftRadius: 7,
        }}>
          {language}
        </div>
      )}
      <button
        onClick={handleCopy}
        aria-label={copied ? "Copied to clipboard" : "Copy code"}
        style={{
          position: "absolute", top: 6, right: 6, padding: 4,
          color: "#6b7280", background: "var(--card, #1e2538)", borderRadius: 4,
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <pre className={className}>
        <code className={className}>{code}</code>
      </pre>
    </div>
  );
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  // System message: centered translucent card
  if (message.role === "system") {
    const borderColor =
      message.systemType === "error"
        ? "rgba(248,113,113,0.25)"
        : message.systemType === "success"
          ? "rgba(110,231,183,0.25)"
          : "rgba(255,255,255,0.12)";
    const bgColor =
      message.systemType === "error"
        ? "rgba(248,113,113,0.06)"
        : message.systemType === "success"
          ? "rgba(110,231,183,0.06)"
          : "rgba(255,255,255,0.03)";

    return (
      <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            maxWidth: "92%",
            fontSize: 12,
            lineHeight: 1.5,
            borderRadius: 8,
            background: bgColor,
            border: `1px solid ${borderColor}`,
            padding: "8px 14px",
            color: "#9ca3af",
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div
      className="animate-fade-in"
      style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}
    >
      <div
        style={{
          maxWidth: "90%", fontSize: 13,
          borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
          background: isUser ? "var(--user-bubble, #0d3b3c)" : "var(--card, #1e2538)",
          border: isUser
            ? "1px solid rgba(110,231,183,0.2)"
            : "1px solid rgba(255,255,255,0.19)",
          boxShadow: isUser ? "none" : "0 1px 4px rgba(0,0,0,0.12)",
          padding: "10px 14px",
        }}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {message.attachments.map((att) => (
              <span
                key={att.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, background: "#1a1d26", borderRadius: 4,
                  padding: "2px 6px", color: "#6b7280",
                }}
              >
                {att.type === "image" ? (
                  <img
                    src={att.content}
                    alt="attachment"
                    style={{ width: 16, height: 16, borderRadius: 4, objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{att.preview}</span>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="markdown-body" style={{ fontSize: 13, lineHeight: 1.6, wordBreak: "break-word" }}>
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

        <div style={{
          fontSize: 10, marginTop: 4, color: "#6b7280",
          textAlign: isUser ? "right" : "left",
        }}>
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
