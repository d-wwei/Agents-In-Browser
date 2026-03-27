import { SYSTEM_COMMANDS } from "@anthropic-ai/agents-in-browser-shared";
import type { ChatState, ChatSession } from "../store/chatStore";
import type { ParsedCommand } from "./commandParser";

export interface CommandContext {
  chatStore: ChatState;
  currentAgentId: string;
  currentAgentIcon?: string;
  sendWsMessage: (type: string, payload: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addSys(ctx: CommandContext, content: string, type: "info" | "error" | "success" = "info") {
  ctx.chatStore.addSystemMessage(content, type);
}

function getSessionId(ctx: CommandContext): string | null {
  return ctx.chatStore.acpSessionId ?? ctx.chatStore.currentSessionId;
}

/** Find a session by partial ID prefix or name match */
function findSession(sessions: ChatSession[], query: string): ChatSession | undefined {
  const lower = query.toLowerCase();
  return (
    sessions.find((s) => s.id.startsWith(query)) ??
    sessions.find((s) => s.name?.toLowerCase() === lower) ??
    sessions.find((s) => s.name?.toLowerCase().includes(lower)) ??
    sessions.find((s) => s.title.toLowerCase().includes(lower))
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleHelp(ctx: CommandContext) {
  const grouped = new Map<string, typeof SYSTEM_COMMANDS>();
  for (const cmd of SYSTEM_COMMANDS) {
    const list = grouped.get(cmd.category) ?? [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }

  const categoryLabels: Record<string, string> = {
    view: "View",
    session: "Session",
    naming: "Naming",
    archive: "Archive",
    context: "Context",
    control: "Control",
    help: "Help",
  };

  const lines: string[] = ["Available Commands:", ""];
  for (const [cat, cmds] of grouped) {
    lines.push(`[${categoryLabels[cat] ?? cat}]`);
    for (const cmd of cmds) {
      const argHint = cmd.args ? ` ${cmd.args}` : "";
      lines.push(`  ${cmd.command}${argHint}  — ${cmd.description}`);
    }
    lines.push("");
  }

  addSys(ctx, lines.join("\n"));
}

async function handleStop(ctx: CommandContext) {
  ctx.chatStore.cancelGeneration();
  const sessionId = getSessionId(ctx);
  if (sessionId) {
    ctx.sendWsMessage("cancel", { sessionId });
  }
  addSys(ctx, "Task stopped.", "success");
}

async function handleNew(parsed: ParsedCommand, ctx: CommandContext) {
  const session = await ctx.chatStore.newSession(ctx.currentAgentId, ctx.currentAgentIcon, {
    clearAcpSession: true,
  });
  ctx.sendWsMessage("new_session", {});

  const path = parsed.rawArgs;
  if (path) {
    const sessionId = getSessionId(ctx);
    if (sessionId) {
      ctx.sendWsMessage("change_cwd", { sessionId, cwd: path });
    }
    await ctx.chatStore.updateSessionCwd(session.id, path);
    addSys(ctx, `New session created (CWD: ${path})`, "success");
  } else {
    addSys(ctx, "New session created.", "success");
  }
}

async function handleRename(parsed: ParsedCommand, ctx: CommandContext) {
  const name = parsed.rawArgs;
  if (!name) {
    addSys(ctx, "Usage: /rename <new_name>", "error");
    return;
  }
  const { currentSessionId } = ctx.chatStore;
  if (!currentSessionId) {
    addSys(ctx, "No active session.", "error");
    return;
  }
  await ctx.chatStore.renameSession(currentSessionId, name);
  addSys(ctx, `Session renamed to: ${name}`, "success");
}

async function handleSessions(ctx: CommandContext) {
  const sessions = ctx.chatStore.sessions.filter((s) => !s.archived);
  if (sessions.length === 0) {
    addSys(ctx, "No sessions.");
    return;
  }

  const lines = sessions.slice(0, 15).map((s, i) => {
    const marker = s.id === ctx.chatStore.currentSessionId ? " *" : "";
    const label = s.name || s.title;
    const shortId = s.id.slice(0, 8);
    return `${i + 1}. [${shortId}] ${label} (${s.agentId}) ${formatRelativeTime(s.updatedAt)}${marker}`;
  });

  addSys(ctx, `Sessions (${sessions.length}):\n${lines.join("\n")}`);
}

async function handleLsessions(parsed: ParsedCommand, ctx: CommandContext) {
  const all = parsed.args.includes("--all");
  const sessionId = getSessionId(ctx);
  ctx.sendWsMessage("list_sessions_request", { all, sessionId });
  // Response handled in App.tsx via list_sessions_response
}

async function handleStatus(ctx: CommandContext) {
  const sessionId = getSessionId(ctx);
  if (!sessionId) {
    addSys(ctx, "No active session.", "error");
    return;
  }
  ctx.sendWsMessage("session_status_request", { sessionId });
  // Response handled in App.tsx via session_status_response
}

async function handleBind(parsed: ParsedCommand, ctx: CommandContext) {
  const targetId = parsed.args[0];
  if (!targetId) {
    addSys(ctx, "Usage: /bind <session_id>", "error");
    return;
  }
  ctx.chatStore.setAcpSessionId(targetId);
  addSys(ctx, `Bound to backend session: ${targetId}`, "success");
}

async function handleSwitchto(parsed: ParsedCommand, ctx: CommandContext) {
  const query = parsed.rawArgs;
  if (!query) {
    addSys(ctx, "Usage: /switchto <session_id|name>", "error");
    return;
  }
  const session = findSession(ctx.chatStore.sessions, query);
  if (!session) {
    addSys(ctx, `Session not found: ${query}`, "error");
    return;
  }
  await ctx.chatStore.switchSession(session.id);
  addSys(ctx, `Switched to: ${session.name || session.title} [${session.id.slice(0, 8)}]`, "success");
}

async function handleArchive(parsed: ParsedCommand, ctx: CommandContext) {
  const query = parsed.rawArgs;
  let sessionId: string | null;

  if (query) {
    const session = findSession(ctx.chatStore.sessions, query);
    if (!session) {
      addSys(ctx, `Session not found: ${query}`, "error");
      return;
    }
    sessionId = session.id;
  } else {
    sessionId = ctx.chatStore.currentSessionId;
  }

  if (!sessionId) {
    addSys(ctx, "No session to archive.", "error");
    return;
  }

  const session = ctx.chatStore.sessions.find((s) => s.id === sessionId);
  await ctx.chatStore.archiveSession(sessionId);
  addSys(ctx, `Archived: ${session?.name || session?.title || sessionId.slice(0, 8)}`, "success");
}

async function handleUnarchive(parsed: ParsedCommand, ctx: CommandContext) {
  const query = parsed.rawArgs;
  if (!query) {
    addSys(ctx, "Usage: /unarchive <session_id|name>", "error");
    return;
  }
  const session = findSession(
    ctx.chatStore.sessions.filter((s) => s.archived),
    query,
  );
  if (!session) {
    addSys(ctx, `Archived session not found: ${query}`, "error");
    return;
  }
  await ctx.chatStore.unarchiveSession(session.id);
  addSys(ctx, `Unarchived: ${session.name || session.title}`, "success");
}

async function handleCwd(parsed: ParsedCommand, ctx: CommandContext) {
  const path = parsed.rawArgs;
  if (!path) {
    addSys(ctx, "Usage: /cwd <path>", "error");
    return;
  }
  const sessionId = getSessionId(ctx);
  if (!sessionId) {
    addSys(ctx, "No active session.", "error");
    return;
  }
  ctx.sendWsMessage("change_cwd", { sessionId, cwd: path });
  // Response handled in App.tsx via cwd_changed
}

async function handleMode(parsed: ParsedCommand, ctx: CommandContext) {
  const mode = parsed.args[0];
  if (!mode || !["plan", "code", "ask"].includes(mode)) {
    addSys(ctx, "Usage: /mode <plan|code|ask>", "error");
    return;
  }
  const sessionId = getSessionId(ctx);
  if (!sessionId) {
    addSys(ctx, "No active session.", "error");
    return;
  }
  ctx.sendWsMessage("change_mode", { sessionId, mode });
  // Response handled in App.tsx via mode_changed
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const handlers: Record<string, (parsed: ParsedCommand, ctx: CommandContext) => Promise<void>> = {
  help: (_, ctx) => handleHelp(ctx),
  stop: (_, ctx) => handleStop(ctx),
  new: handleNew,
  rename: handleRename,
  sessions: (_, ctx) => handleSessions(ctx),
  lsessions: handleLsessions,
  status: (_, ctx) => handleStatus(ctx),
  bind: handleBind,
  switchto: handleSwitchto,
  archive: handleArchive,
  unarchive: handleUnarchive,
  cwd: handleCwd,
  mode: handleMode,
};

export async function executeCommand(parsed: ParsedCommand, ctx: CommandContext): Promise<void> {
  const handler = handlers[parsed.command];
  if (!handler) {
    addSys(ctx, `Unknown command: /${parsed.command}`, "error");
    return;
  }
  try {
    await handler(parsed, ctx);
  } catch (err) {
    addSys(ctx, `Command error: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
}
