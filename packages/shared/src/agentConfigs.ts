export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
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
    id: "mock-agent",
    name: "Mock Agent",
    description: "测试用模拟 Agent（无需额外安装）",
    command: "npx",
    args: ["--yes", "tsx", "src/mock-agent.ts"],
    icon: "🧪",
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
  {
    id: "opencode",
    name: "OpenCode",
    description: "开源终端 AI 助手",
    command: "opencode",
    args: ["acp"],
    icon: "⚪",
    installInstructions: "curl -fsSL https://opencode.ai/install | bash",
  },
  {
    id: "qwen",
    name: "Qwen Code",
    description: "通义千问编码助手",
    command: "qwen",
    args: ["--acp"],
    icon: "🟠",
    installInstructions: "npm install -g @qwen-code/qwen-code@latest",
  },
];

export function getAgentById(id: string): AgentConfig | undefined {
  return PRESET_AGENTS.find((a) => a.id === id);
}
