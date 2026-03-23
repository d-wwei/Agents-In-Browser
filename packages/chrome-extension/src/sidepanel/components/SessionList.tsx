import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { CornerUpLeft, Trash2 } from "lucide-react";
import { useChatStore, type ChatSession } from "../store/chatStore";
import { useAgentStore } from "../store/agentStore";

interface SessionListProps {
  onClose: () => void;
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDateGroup(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function SessionList({ onClose }: SessionListProps) {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const newSession = useChatStore((s) => s.newSession);

  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const agents = useAgentStore((s) => s.agents);
  const currentAgent = agents.find((a) => a.id === currentAgentId);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groupedSessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    const groups: { label: string; sessions: ChatSession[] }[] = [];
    let currentGroup: string | null = null;

    for (const session of sorted) {
      const group = formatDateGroup(session.updatedAt);
      if (group !== currentGroup) {
        groups.push({ label: group, sessions: [] });
        currentGroup = group;
      }
      groups[groups.length - 1].sessions.push(session);
    }

    return groups;
  }, [sessions]);

  const handleNewSession = useCallback(() => {
    void newSession(currentAgentId, currentAgent?.icon);
    onClose();
  }, [newSession, currentAgentId, currentAgent, onClose]);

  const handleSelect = useCallback(
    (sessionId: string) => {
      void switchSession(sessionId);
      onClose();
    },
    [switchSession, onClose],
  );

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const handleDelete = useCallback(
    (sessionId: string) => {
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = null;
      }
      if (deletingId === sessionId) {
        void deleteSession(sessionId);
        setDeletingId(null);
      } else {
        setDeletingId(sessionId);
        deleteTimerRef.current = setTimeout(() => setDeletingId(null), 3000);
      }
    },
    [deleteSession, deletingId],
  );

  const getAgentIcon = (session: ChatSession): string => {
    if (session.agentIcon) return session.agentIcon;
    const agent = agents.find((a) => a.id === session.agentId);
    return agent?.icon || "🤖";
  };

  const getAgentName = (session: ChatSession): string | undefined => {
    const agent = agents.find((a) => a.id === session.agentId);
    return agent?.name;
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--background, #0f1117)" }}>
      {/* Header: height 48, bg card, border-bottom */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", height: 48, flexShrink: 0,
        background: "var(--card, #1e2538)",
        borderBottom: "1px solid rgba(255,255,255,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onClose}
            aria-label="Back"
            style={{
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6, border: "none", background: "none", cursor: "pointer",
              color: "#9ca3af",
            }}
          >
            <CornerUpLeft size={16} />
          </button>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#d1d5db" }}>
            Sessions
          </span>
        </div>
        <button
          onClick={handleNewSession}
          style={{
            padding: "5px 12px", borderRadius: 6, border: "none",
            background: "#6ee7b7", color: "#0f1117",
            fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
            cursor: "pointer",
          }}
        >
          New Session
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sessions.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", color: "#6b7280", fontFamily: "'DM Sans', sans-serif", fontSize: 12,
          }}>
            <p style={{ margin: 0 }}>No sessions yet</p>
            <button
              onClick={handleNewSession}
              style={{
                marginTop: 8, background: "none", border: "none", cursor: "pointer",
                color: "#d1d5db", fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                textDecoration: "underline",
              }}
            >
              Start a new session
            </button>
          </div>
        ) : (
          <div style={{ padding: "4px 0" }}>
            {groupedSessions.map((group) => (
              <div key={group.label}>
                <div style={{
                  padding: "6px 16px",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b7280",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  position: "sticky", top: 0, background: "var(--background, #0f1117)",
                }}>
                  {group.label}
                </div>
                {group.sessions.map((session) => {
                  const isActive = session.id === currentSessionId;
                  return (
                    <div
                      key={session.id}
                      onClick={() => handleSelect(session.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 16px", cursor: "pointer",
                        background: isActive ? "rgba(110,231,183,0.08)" : undefined,
                        borderLeft: isActive ? "2px solid #6ee7b7" : "2px solid transparent",
                      }}
                    >
                      <span style={{ fontSize: 14, flexShrink: 0 }}>
                        {getAgentIcon(session)}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#d1d5db",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {session.title || "New chat"}
                        </div>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6,
                          fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b7280", marginTop: 2,
                        }}>
                          {getAgentName(session) && (
                            <>
                              <span>{getAgentName(session)}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{formatRelativeTime(session.updatedAt)}</span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(session.id);
                        }}
                        aria-label={
                          deletingId === session.id
                            ? "Click again to confirm deletion"
                            : `Delete session: ${session.title || "New chat"}`
                        }
                        style={{
                          padding: 4, borderRadius: 4, border: "none", flexShrink: 0,
                          cursor: "pointer",
                          background: deletingId === session.id ? "rgba(248,113,113,0.15)" : "none",
                          color: deletingId === session.id ? "#f87171" : "#6b7280",
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
