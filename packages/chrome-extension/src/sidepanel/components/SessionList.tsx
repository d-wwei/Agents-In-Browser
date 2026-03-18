import { useMemo, useCallback, useState, useRef, useEffect } from "react";
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

  // Group sessions by date
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

  // Resolve agent icon for a session
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
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Sessions
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewSession}
            className="px-2.5 py-1 text-[11px] rounded bg-accent hover:bg-accent-hover text-white transition-colors"
          >
            New Session
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
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
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-[12px]">
            <p>No sessions yet</p>
            <button
              onClick={handleNewSession}
              className="mt-2 text-accent hover:text-accent-hover transition-colors"
            >
              Start a new session
            </button>
          </div>
        ) : (
          <div className="py-1">
            {groupedSessions.map((group) => (
              <div key={group.label}>
                <div className="px-4 py-1.5 text-[10px] text-text-muted uppercase tracking-wider sticky top-0 bg-bg-primary">
                  {group.label}
                </div>
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors group ${
                      session.id === currentSessionId
                        ? "bg-bg-hover"
                        : "hover:bg-bg-secondary"
                    }`}
                    onClick={() => handleSelect(session.id)}
                  >
                    {/* Agent icon */}
                    <span className="text-[14px] shrink-0">
                      {getAgentIcon(session)}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-text-primary truncate">
                          {session.title || "New chat"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                        {getAgentName(session) && (
                          <>
                            <span>{getAgentName(session)}</span>
                            <span>-</span>
                          </>
                        )}
                        <span>{formatRelativeTime(session.updatedAt)}</span>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(session.id);
                      }}
                      className={`p-1 rounded shrink-0 transition-all ${
                        deletingId === session.id
                          ? "bg-error/20 text-error opacity-100"
                          : "text-text-muted hover:text-error opacity-0 group-hover:opacity-100"
                      }`}
                      title={
                        deletingId === session.id
                          ? "Click again to confirm"
                          : "Delete session"
                      }
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <path d="M2 3h8M4.5 3V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M9 3v6.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
