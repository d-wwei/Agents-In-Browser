// System command definitions for session management
// These commands are intercepted client-side and NOT sent to the agent.

export interface CommandDefinition {
  command: string;
  label: string;
  description: string;
  category: "view" | "session" | "naming" | "archive" | "context" | "control" | "help";
  args?: string;
  isSystemCommand: true;
}

export const SYSTEM_COMMANDS: CommandDefinition[] = [
  // View
  {
    command: "/status",
    label: "Status",
    description: "Show current session state (ID, CWD, mode, model)",
    category: "view",
    isSystemCommand: true,
  },
  {
    command: "/sessions",
    label: "Sessions",
    description: "List recent sessions",
    category: "view",
    isSystemCommand: true,
  },
  {
    command: "/lsessions",
    label: "Bridge Sessions",
    description: "List active bridge sessions with details",
    category: "view",
    args: "[--all]",
    isSystemCommand: true,
  },

  // Session create/switch
  {
    command: "/new",
    label: "New Session",
    description: "Create a new session, optionally set working directory",
    category: "session",
    args: "[path]",
    isSystemCommand: true,
  },
  {
    command: "/bind",
    label: "Bind Session",
    description: "Bind current chat to a specific backend session ID",
    category: "session",
    args: "<session_id>",
    isSystemCommand: true,
  },
  {
    command: "/switchto",
    label: "Switch Session",
    description: "Switch to an existing session by ID or name",
    category: "session",
    args: "<session_id|name>",
    isSystemCommand: true,
  },

  // Naming
  {
    command: "/rename",
    label: "Rename",
    description: "Rename the current session",
    category: "naming",
    args: "<new_name>",
    isSystemCommand: true,
  },

  // Archive
  {
    command: "/archive",
    label: "Archive",
    description: "Archive current or specified session",
    category: "archive",
    args: "[session_id|name]",
    isSystemCommand: true,
  },
  {
    command: "/unarchive",
    label: "Unarchive",
    description: "Restore an archived session",
    category: "archive",
    args: "<session_id|name>",
    isSystemCommand: true,
  },

  // Context
  {
    command: "/cwd",
    label: "Change CWD",
    description: "Change the working directory for this session",
    category: "context",
    args: "<path>",
    isSystemCommand: true,
  },
  {
    command: "/mode",
    label: "Change Mode",
    description: "Switch session mode (plan / code / ask)",
    category: "context",
    args: "<plan|code|ask>",
    isSystemCommand: true,
  },

  // Control
  {
    command: "/stop",
    label: "Stop",
    description: "Stop the current running task",
    category: "control",
    isSystemCommand: true,
  },

  // Help
  {
    command: "/help",
    label: "Help",
    description: "Show available commands and help",
    category: "help",
    isSystemCommand: true,
  },
];

const systemCommandNames = new Set(
  SYSTEM_COMMANDS.map((c) => c.command.slice(1)), // strip leading "/"
);

export function isSystemCommand(commandName: string): boolean {
  return systemCommandNames.has(commandName);
}
