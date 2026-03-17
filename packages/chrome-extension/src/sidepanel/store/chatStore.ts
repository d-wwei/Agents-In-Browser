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

export interface TaskStep {
  id: string;
  sessionId: string;
  stepIndex: number;
  callId: string;
  action: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: "pending" | "complete" | "error";
  screenshot?: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// IndexedDB persistence
// ---------------------------------------------------------------------------

const DB_NAME = "acp-chat";
const DB_VERSION = 2;
const SESSIONS_STORE = "sessions";
const MESSAGES_STORE = "messages";
const TASK_STEPS_STORE = "taskSteps";

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
        if (!db.objectStoreNames.contains(TASK_STEPS_STORE)) {
          const store = db.createObjectStore(TASK_STEPS_STORE, { keyPath: "id" });
          store.createIndex("sessionId", "sessionId", { unique: false });
          store.createIndex("session_step", ["sessionId", "stepIndex"], { unique: true });
        }
      },
    });
  }
  return dbPromise;
}

interface StoredMessage extends ChatMessage {
  sessionId: string;
}

interface StoredTaskStep extends TaskStep {}

async function persistSession(session: ChatSession): Promise<void> {
  const db = await getDb();
  await db.put(SESSIONS_STORE, session);
}

async function deleteSessionFromDb(sessionId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([SESSIONS_STORE, MESSAGES_STORE, TASK_STEPS_STORE], "readwrite");
  tx.objectStore(SESSIONS_STORE).delete(sessionId);

  const msgStore = tx.objectStore(MESSAGES_STORE);
  const msgIndex = msgStore.index("sessionId");
  let msgCursor = await msgIndex.openCursor(IDBKeyRange.only(sessionId));
  while (msgCursor) {
    msgCursor.delete();
    msgCursor = await msgCursor.continue();
  }

  const stepStore = tx.objectStore(TASK_STEPS_STORE);
  const stepIndex = stepStore.index("sessionId");
  let stepCursor = await stepIndex.openCursor(IDBKeyRange.only(sessionId));
  while (stepCursor) {
    stepCursor.delete();
    stepCursor = await stepCursor.continue();
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


async function persistTaskStep(step: TaskStep): Promise<void> {
  const db = await getDb();
  const stored: StoredTaskStep = { ...step };
  await db.put(TASK_STEPS_STORE, stored);
}

async function loadTaskSteps(sessionId: string): Promise<TaskStep[]> {
  const db = await getDb();
  const index = db.transaction(TASK_STEPS_STORE).store.index("sessionId");
  const stored = (await index.getAll(IDBKeyRange.only(sessionId))) as StoredTaskStep[];
  return stored.sort((a, b) => a.stepIndex - b.stepIndex || a.timestamp - b.timestamp);
}

function nextStepIndex(steps: TaskStep[], sessionId: string): number {
  const last = steps
    .filter((s) => s.sessionId === sessionId)
    .reduce((max, s) => Math.max(max, s.stepIndex), -1);
  return last + 1;
}


async function captureMiniScreenshot(): Promise<string | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab?.windowId, { format: "png" });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Failed to load screenshot image"));
      i.src = dataUrl;
    });

    const maxWidth = 320;
    const scale = Math.min(1, maxWidth / img.width);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return undefined;
  }
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
  taskSteps: TaskStep[];

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
  loadTaskStepsForSession: (sessionId: string) => Promise<void>;
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
  taskSteps: [],

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
      const taskSteps = await loadTaskSteps(sessions[0].id);
      set({
        sessions,
        currentSessionId: sessions[0].id,
        messages,
        taskSteps,
        initialized: true,
      });
    } else {
      set({ sessions: [], currentSessionId: null, messages: [], taskSteps: [], initialized: true });
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
    const now = Date.now();
    const info: ToolCallInfo = {
      ...toolCall,
      status: "pending",
      startTime: now,
    };
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, toolCalls: [...(m.toolCalls ?? []), info] }
          : m,
      ),
    }));

    const { currentSessionId, taskSteps } = get();
    if (currentSessionId) {
      const step: TaskStep = {
        id: generateId(),
        sessionId: currentSessionId,
        stepIndex: nextStepIndex(taskSteps, currentSessionId),
        callId: toolCall.callId,
        action: toolCall.tool,
        args: toolCall.args,
        status: "pending",
        timestamp: now,
      };
      set((s) => ({ taskSteps: [...s.taskSteps, step] }));
      void persistTaskStep(step);
    }
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

    const { currentSessionId, messages, taskSteps } = get();
    const msg = messages.find((m) => m.id === messageId);
    if (msg && currentSessionId) {
      void persistMessage(currentSessionId, msg);
    }

    if (currentSessionId) {
      const existing = taskSteps.find((s) => s.sessionId === currentSessionId && s.callId === callId);
      if (existing) {
        const nextStatus = update.status ?? existing.status;
        const baseUpdatedStep: TaskStep = {
          ...existing,
          status: nextStatus,
          result: update.result ?? existing.result,
          error: update.error ?? existing.error,
          timestamp: update.endTime ?? Date.now(),
        };

        set((s) => ({
          taskSteps: s.taskSteps.map((step) =>
            step.id === baseUpdatedStep.id ? baseUpdatedStep : step,
          ),
        }));
        void persistTaskStep(baseUpdatedStep);

        if ((nextStatus === "complete" || nextStatus === "error") && !baseUpdatedStep.screenshot) {
          void captureMiniScreenshot().then((screenshot) => {
            if (!screenshot) return;
            const withScreenshot: TaskStep = { ...baseUpdatedStep, screenshot };
            set((state) => ({
              taskSteps: state.taskSteps.map((step) =>
                step.id === withScreenshot.id ? withScreenshot : step,
              ),
            }));
            void persistTaskStep(withScreenshot);
          });
        }
      }
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
      taskSteps: [],
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
    const taskSteps = await loadTaskSteps(sessionId);
    set({
      currentSessionId: sessionId,
      messages,
      taskSteps,
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
        const taskSteps = await loadTaskSteps(remaining[0].id);
        set({
          sessions: remaining,
          currentSessionId: remaining[0].id,
          messages,
          taskSteps,
          isStreaming: false,
          streamingMessageId: null,
        });
      } else {
        set({
          sessions: [],
          currentSessionId: null,
          messages: [],
          taskSteps: [],
          isStreaming: false,
          streamingMessageId: null,
        });
      }
    } else {
      set((state) => ({
        sessions: remaining,
        taskSteps: state.taskSteps.filter((step) => step.sessionId !== sessionId),
      }));
    }
  },

  async loadTaskStepsForSession(sessionId) {
    const taskSteps = await loadTaskSteps(sessionId);
    const { currentSessionId } = get();
    if (currentSessionId === sessionId) {
      set({ taskSteps });
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
