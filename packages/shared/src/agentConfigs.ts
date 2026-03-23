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
  installInstructions?: string;
  requiresAuth?: boolean;
  isCustom?: boolean;
}

export const PRESET_AGENTS: AgentConfig[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic 的编码助手",
    command: "claude-code-acp",
    args: [],
    icon: "🟣",
    installInstructions:
      "npm install -g @zed-industries/claude-code-acp",
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI 的编码助手",
    command: "codex-acp",
    args: [],
    icon: "🟢",
    installInstructions:
      "npm install -g @openai/codex @zed-industries/codex-acp",
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
];

export function getAgentById(id: string): AgentConfig | undefined {
  return PRESET_AGENTS.find((a) => a.id === id);
}
