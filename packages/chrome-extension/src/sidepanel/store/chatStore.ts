import { create } from "zustand";
import { openDB, type IDBPDatabase } from "idb";
import type { ChatAttachment } from "@anthropic-ai/acp-browser-shared";
import { MAX_REFERENCES, REFERENCE_PREVIEW_MAX_CHARS } from "@anthropic-ai/acp-browser-shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallInfo {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  status: "pending" | "complete" | "error";
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  agentId: string;
  agentIcon?: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  attachments?: ChatAttachment[];
}

export interface ChatSession {
  id: string;
  agentId: string;
  agentIcon?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// IndexedDB persistence
// ---------------------------------------------------------------------------

const DB_NAME = "acp-chat";
const DB_VERSION = 1;
const SESSIONS_STORE = "sessions";
const MESSAGES_STORE = "messages";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const store = db.createObjectStore(MESSAGES_STORE, { keyPath: "id" });
          store.createIndex("sessionId", "sessionId", { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

interface StoredMessage extends ChatMessage {
  sessionId: string;
}

async function persistSession(session: ChatSession): Promise<void> {
  const db = await getDb();
  await db.put(SESSIONS_STORE, session);
}

async function deleteSessionFromDb(sessionId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([SESSIONS_STORE, MESSAGES_STORE], "readwrite");
  tx.objectStore(SESSIONS_STORE).delete(sessionId);
  const msgStore = tx.objectStore(MESSAGES_STORE);
  const index = msgStore.index("sessionId");
  let cursor = await index.openCursor(IDBKeyRange.only(sessionId));
  while (cursor) {
    cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

async function persistMessage(
  sessionId: string,
  message: ChatMessage,
): Promise<void> {
  const db = await getDb();
  const stored: StoredMessage = { ...message, sessionId };
  await db.put(MESSAGES_STORE, stored);
}

async function loadSessions(): Promise<ChatSession[]> {
  const db = await getDb();
  const sessions = (await db.getAll(SESSIONS_STORE)) as ChatSession[];
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const index = db.transaction(MESSAGES_STORE).store.index("sessionId");
  const stored = (await index.getAll(
    IDBKeyRange.only(sessionId),
  )) as StoredMessage[];
  return stored
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(({ sessionId: _sid, ...msg }) => msg);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function deriveTitle(content: string): string {
  const stripped = content.replace(/\n/g, " ").trim();
  return stripped.length > 60 ? stripped.slice(0, 57) + "..." : stripped || "New chat";
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface ChatState {
  // Data
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  references: ChatAttachment[];
  acpSessionId: string | null;
  isStreaming: boolean;
  streamingMessageId: string | null;
  initialized: boolean;

  // Actions
  init: () => Promise<void>;
  setAcpSessionId: (id: string) => void;
  sendMessage: (content: string, agentId: string, agentIcon?: string) => Promise<ChatMessage>;
  appendDelta: (sessionId: string, text: string, agentId: string, agentIcon?: string) => void;
  finalizeStream: () => void;
  addToolCall: (messageId: string, toolCall: Omit<ToolCallInfo, "status" | "startTime">) => void;
  updateToolCall: (
    messageId: string,
    callId: string,
    update: Partial<Pick<ToolCallInfo, "status" | "result" | "error" | "endTime">>,
  ) => void;
  cancelGeneration: () => void;
  newSession: (agentId: string, agentIcon?: string) => Promise<ChatSession>;
  switchSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  addReference: (attachment: ChatAttachment) => void;
  removeReference: (id: string) => void;
  clearReferences: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  acpSessionId: null,
  messages: [],
  references: [],
  isStreaming: false,
  streamingMessageId: null,
  initialized: false,

  setAcpSessionId(id: string) {
    set({ acpSessionId: id });
  },

  // ----------------------------------
  // Init – load from IndexedDB
  // ----------------------------------
  async init() {
    if (get().initialized) return;
    const sessions = await loadSessions();
    if (sessions.length > 0) {
      const messages = await loadMessages(sessions[0].id);
      set({
        sessions,
        currentSessionId: sessions[0].id,
        messages,
        initialized: true,
      });
    } else {
      set({ sessions: [], currentSessionId: null, messages: [], initialized: true });
    }
  },

  // ----------------------------------
  // Send a user message
  // ----------------------------------
  async sendMessage(content, agentId, agentIcon) {
    let { currentSessionId, sessions, references } = get();

    // Create session if none
    if (!currentSessionId) {
      const session = await get().newSession(agentId, agentIcon);
      currentSessionId = session.id;
      sessions = get().sessions;
    }

    const message: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      agentId,
      agentIcon,
      timestamp: Date.now(),
      attachments: references.length > 0 ? [...references] : undefined,
    };

    // Update session title from first user message
    const session = sessions.find((s) => s.id === currentSessionId);
    if (session) {
      const currentMessages = get().messages;
      const hasUserMessage = currentMessages.some((m) => m.role === "user");
      if (!hasUserMessage) {
        const updated = { ...session, title: deriveTitle(content), updatedAt: Date.now() };
        set((s) => ({
          sessions: s.sessions.map((ss) => (ss.id === currentSessionId ? updated : ss)),
        }));
        await persistSession(updated);
      } else {
        const updated = { ...session, updatedAt: Date.now() };
        set((s) => ({
          sessions: s.sessions.map((ss) => (ss.id === currentSessionId ? updated : ss)),
        }));
        await persistSession(updated);
      }
    }

    set((s) => ({
      messages: [...s.messages, message],
      references: [],
      isStreaming: true,
    }));

    await persistMessage(currentSessionId!, message);
    return message;
  },

  // ----------------------------------
  // Append streaming text delta
  // ----------------------------------
  appendDelta(sessionId, text, agentId, agentIcon) {
    const { currentSessionId, acpSessionId, streamingMessageId } = get();
    // Accept deltas matching either the local session ID or the real ACP session ID
    if (sessionId !== currentSessionId && sessionId !== acpSessionId) return;

    if (!streamingMessageId) {
      // Create a new agent message
      const newMsg: ChatMessage = {
        id: generateId(),
        role: "agent",
        content: text,
        agentId,
        agentIcon,
        timestamp: Date.now(),
      };
      set((s) => ({
        messages: [...s.messages, newMsg],
        streamingMessageId: newMsg.id,
        isStreaming: true,
      }));
      persistMessage(sessionId, newMsg);
    } else {
      // Append to existing message
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === streamingMessageId ? { ...m, content: m.content + text } : m,
        ),
      }));
      // Debounced persist – persist the final version in finalizeStream
    }
  },

  // ----------------------------------
  // Finalize streaming message
  // ----------------------------------
  finalizeStream() {
    const { streamingMessageId, currentSessionId, messages } = get();
    if (streamingMessageId && currentSessionId) {
      const msg = messages.find((m) => m.id === streamingMessageId);
      if (msg) {
        persistMessage(currentSessionId, msg);
      }
    }

    // Update session timestamp
    const session = get().sessions.find((s) => s.id === currentSessionId);
    if (session) {
      const updated = { ...session, updatedAt: Date.now() };
      set((s) => ({
        sessions: s.sessions.map((ss) => (ss.id === currentSessionId ? updated : ss)),
      }));
      persistSession(updated);
    }

    set({ isStreaming: false, streamingMessageId: null });
  },

  // ----------------------------------
  // Tool calls
  // ----------------------------------
  addToolCall(messageId, toolCall) {
    const info: ToolCallInfo = {
      ...toolCall,
      status: "pending",
      startTime: Date.now(),
    };
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, toolCalls: [...(m.toolCalls ?? []), info] }
          : m,
      ),
    }));
  },

  updateToolCall(messageId, callId, update) {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          toolCalls: m.toolCalls?.map((tc) =>
            tc.callId === callId ? { ...tc, ...update } : tc,
          ),
        };
      }),
    }));
    // Persist updated message
    const { currentSessionId, messages } = get();
    const msg = messages.find((m) => m.id === messageId);
    if (msg && currentSessionId) {
      persistMessage(currentSessionId, msg);
    }
  },

  // ----------------------------------
  // Cancel
  // ----------------------------------
  cancelGeneration() {
    set({ isStreaming: false, streamingMessageId: null });
  },

  // ----------------------------------
  // Session management
  // ----------------------------------
  async newSession(agentId, agentIcon) {
    const session: ChatSession = {
      id: generateId(),
      agentId,
      agentIcon,
      title: "New chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await persistSession(session);
    set((s) => ({
      sessions: [session, ...s.sessions],
      currentSessionId: session.id,
      messages: [],
      references: [],
      isStreaming: false,
      streamingMessageId: null,
    }));
    return session;
  },

  async switchSession(sessionId) {
    const { currentSessionId } = get();
    if (sessionId === currentSessionId) return;
    const messages = await loadMessages(sessionId);
    set({
      currentSessionId: sessionId,
      messages,
      references: [],
      isStreaming: false,
      streamingMessageId: null,
    });
  },

  async deleteSession(sessionId) {
    await deleteSessionFromDb(sessionId);
    const { currentSessionId, sessions } = get();
    const remaining = sessions.filter((s) => s.id !== sessionId);

    if (sessionId === currentSessionId) {
      if (remaining.length > 0) {
        const messages = await loadMessages(remaining[0].id);
        set({
          sessions: remaining,
          currentSessionId: remaining[0].id,
          messages,
          isStreaming: false,
          streamingMessageId: null,
        });
      } else {
        set({
          sessions: [],
          currentSessionId: null,
          messages: [],
          isStreaming: false,
          streamingMessageId: null,
        });
      }
    } else {
      set({ sessions: remaining });
    }
  },

  // ----------------------------------
  // References (attachments queue)
  // ----------------------------------
  addReference(attachment) {
    const { references } = get();
    if (references.length >= MAX_REFERENCES) return;
    if (references.some((r) => r.id === attachment.id)) return;
    const trimmed: ChatAttachment = {
      ...attachment,
      preview:
        attachment.preview.length > REFERENCE_PREVIEW_MAX_CHARS
          ? attachment.preview.slice(0, REFERENCE_PREVIEW_MAX_CHARS) + "..."
          : attachment.preview,
    };
    set((s) => ({ references: [...s.references, trimmed] }));
  },

  removeReference(id) {
    set((s) => ({ references: s.references.filter((r) => r.id !== id) }));
  },

  clearReferences() {
    set({ references: [] });
  },
}));
