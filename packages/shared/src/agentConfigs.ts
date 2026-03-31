export interface AgentDependency {
  /** Binary command name to check */
  command: string;
  /** Human-readable label */
  label: string;
  /** Install command for this dependency */
  installCommand: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  /** Working directory for spawning the agent (e.g. fork repo root for `npx` local bin) */
  cwd?: string;
  env?: Record<string, string>;
  icon?: string;
  /**
   * Granular dependencies — each checked independently at preflight.
   * When provided, `installInstructions` is ignored in favor of per-dependency install commands.
   */
  dependencies?: AgentDependency[];
  installInstructions?: string;
  requiresAuth?: boolean;
  isCustom?: boolean;
  /** 默认启用 --dangerously-skip-permissions（仅支持该 flag 的 agent 有效） */
  skipPermissions?: boolean;
}

export const PRESET_AGENTS: AgentConfig[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic 的编码助手",
    command: "claude-code-acp",
    args: [],
    icon: "🟣",
    dependencies: [
      {
        command: "claude",
        label: "Claude Code CLI",
        installCommand: "npm install -g @anthropic-ai/claude-code",
      },
      {
        command: "claude-code-acp",
        label: "Claude Code ACP adapter",
        installCommand: "npm install -g @agentclientprotocol/claude-agent-acp",
      },
    ],
    installInstructions:
      "npm install -g @agentclientprotocol/claude-agent-acp",
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI 的编码助手",
    command: "codex-acp",
    args: [],
    icon: "🟢",
    dependencies: [
      {
        command: "codex",
        label: "Codex CLI",
        installCommand: "npm install -g @openai/codex",
      },
      {
        command: "codex-acp",
        label: "Codex ACP adapter",
        installCommand: "npm install -g @zed-industries/codex-acp",
      },
    ],
    installInstructions:
      "npm install -g @zed-industries/codex-acp",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    description: "Google 的 AI 编码助手（免费额度）",
    command: "gemini",
    args: ["--experimental-acp"],
    icon: "🔵",
    installInstructions: "npm install -g @google/gemini-cli",
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "开源 AI 编码助手",
    command: "opencode",
    args: ["--acp"],
    icon: "⚡",
    installInstructions: "go install github.com/opencode-ai/opencode@latest",
  },
];

export function getAgentById(id: string): AgentConfig | undefined {
  return PRESET_AGENTS.find((a) => a.id === id);
}

const SKIP_PERMISSIONS_COMMANDS = new Set(["claude-code-acp", "opencode"]);

export function supportsSkipPermissions(config: AgentConfig): boolean {
  return SKIP_PERMISSIONS_COMMANDS.has(config.command);
}
