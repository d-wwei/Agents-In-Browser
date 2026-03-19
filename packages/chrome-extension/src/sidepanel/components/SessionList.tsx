import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
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
    <div className="h-full flex flex-col bg-bg-primary">
      <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Sessions
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewSession}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-accent hover:bg-accent-hover text-bg-primary font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          >
            New Session
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
            aria-label="Close sessions"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-[12px]">
            <p>No sessions yet</p>
            <button
              onClick={handleNewSession}
              className="mt-2 text-accent hover:text-accent-hover transition-colors duration-150"
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
                    className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors duration-150 group ${
                      session.id === currentSessionId
                        ? "bg-bg-hover"
                        : "hover:bg-bg-secondary"
                    }`}
                    onClick={() => handleSelect(session.id)}
                  >
                    <span className="text-[14px] shrink-0">
                      {getAgentIcon(session)}
                    </span>

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

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(session.id);
                      }}
                      className={`p-1 rounded-lg shrink-0 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none ${
                        deletingId === session.id
                          ? "bg-error/15 text-error opacity-100"
                          : "text-text-muted hover:text-error opacity-0 group-hover:opacity-100"
                      }`}
                      aria-label={
                        deletingId === session.id
                          ? "Click again to confirm deletion"
                          : `Delete session: ${session.title || "New chat"}`
                      }
                    >
                      <Trash2 size={12} aria-hidden="true" />
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
