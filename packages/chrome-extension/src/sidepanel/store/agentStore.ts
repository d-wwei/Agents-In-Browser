import { create } from "zustand";
import {
  PRESET_AGENTS,
  type AgentConfig,
  type AgentConnectionState,
} from "@anthropic-ai/agents-in-browser-shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentWithState extends AgentConfig {
  connectionState: AgentConnectionState;
  error?: string;
}

export interface AgentPreflightState {
  agentId: string;
  agentName: string;
  config: AgentConfig;
  reason: "auto" | "manual";
  carryContext: boolean;
  status: "checking" | "prompt_install" | "installing" | "error";
  message: string;
  installInstructions?: string;
}

export interface AgentState {
  currentAgentId: string;
  agents: AgentWithState[];
  preflight: AgentPreflightState | null;

  // Actions
  switchAgent: (agentId: string) => void;
  addCustomAgent: (config: AgentConfig) => Promise<void>;
  removeCustomAgent: (agentId: string) => Promise<void>;
  updateAgentState: (agentId: string, state: AgentConnectionState, error?: string) => void;
  setPreflight: (preflight: AgentPreflightState | null) => void;
}

// ---------------------------------------------------------------------------
// Persistence helpers (chrome.storage.local for custom agents)
// ---------------------------------------------------------------------------

const STORAGE_KEY_CUSTOM_AGENTS = "acp:customAgents";
const STORAGE_KEY_CURRENT_AGENT = "acp:currentAgentId";
/** Default when nothing stored (production) */
const DEFAULT_AGENT_ID = "claude-code";
/** Legacy IDs no longer in presets — migrate to default */
const LEGACY_AGENT_IDS = new Set(["mock-agent", "opencode", "qwen"]);

async function loadCustomAgents(): Promise<AgentConfig[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_CUSTOM_AGENTS);
    return (result[STORAGE_KEY_CUSTOM_AGENTS] as AgentConfig[]) ?? [];
  } catch {
    return [];
  }
}

async function saveCustomAgents(agents: AgentConfig[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_CUSTOM_AGENTS]: agents });
}

async function loadCurrentAgentId(): Promise<string> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_CURRENT_AGENT);
    const storedId = result[STORAGE_KEY_CURRENT_AGENT] as string | undefined;
    if (!storedId) return DEFAULT_AGENT_ID;
    return LEGACY_AGENT_IDS.has(storedId) ? DEFAULT_AGENT_ID : storedId;
  } catch {
    return DEFAULT_AGENT_ID;
  }
}

async function saveCurrentAgentId(id: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_CURRENT_AGENT]: id });
}

// ---------------------------------------------------------------------------
// Build initial agents list
// ---------------------------------------------------------------------------

function toAgentWithState(config: AgentConfig): AgentWithState {
  return { ...config, connectionState: "disconnected" };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAgentStore = create<AgentState>((set, get) => {
  // Eager init: load custom agents and current agent from storage
  void (async () => {
    const [customAgents, currentId] = await Promise.all([
      loadCustomAgents(),
      loadCurrentAgentId(),
    ]);
    const allAgents = [
      ...PRESET_AGENTS.map(toAgentWithState),
      ...customAgents.map((c) => toAgentWithState({ ...c, isCustom: true })),
    ];
    const validId = allAgents.some((a) => a.id === currentId)
      ? currentId
      : DEFAULT_AGENT_ID;
    set({ agents: allAgents, currentAgentId: validId });
    if (validId !== currentId) {
      await saveCurrentAgentId(validId);
    }
  })();

  return {
    currentAgentId: DEFAULT_AGENT_ID,
    agents: PRESET_AGENTS.map(toAgentWithState),
    preflight: null,

    switchAgent(agentId) {
      const { agents } = get();
      if (!agents.some((a) => a.id === agentId)) return;
      set({ currentAgentId: agentId });
      void saveCurrentAgentId(agentId);
    },

    async addCustomAgent(config) {
      const withCustom: AgentConfig = { ...config, isCustom: true };
      const agentWithState = toAgentWithState(withCustom);

      set((s) => {
        // Replace if same id exists
        const existing = s.agents.findIndex((a) => a.id === config.id);
        if (existing >= 0) {
          const updated = [...s.agents];
          updated[existing] = agentWithState;
          return { agents: updated };
        }
        return { agents: [...s.agents, agentWithState] };
      });

      // Persist custom agents only
      const customs = get()
        .agents.filter((a) => a.isCustom)
        .map(({ connectionState: _cs, error: _err, ...rest }) => rest as AgentConfig);
      await saveCustomAgents(customs);
    },

    async removeCustomAgent(agentId) {
      const { agents, currentAgentId } = get();
      const agent = agents.find((a) => a.id === agentId);
      if (!agent || !agent.isCustom) return;

      const filtered = agents.filter((a) => a.id !== agentId);
      const newCurrentId =
        currentAgentId === agentId ? DEFAULT_AGENT_ID : currentAgentId; // fallback to Claude Code

      set({ agents: filtered, currentAgentId: newCurrentId });

      const customs = filtered
        .filter((a) => a.isCustom)
        .map(({ connectionState: _cs, error: _err, ...rest }) => rest as AgentConfig);
      await saveCustomAgents(customs);
      if (newCurrentId !== currentAgentId) {
        await saveCurrentAgentId(newCurrentId);
      }
    },

    updateAgentState(agentId, state, error) {
      set((s) => ({
        agents: s.agents.map((a) =>
          a.id === agentId ? { ...a, connectionState: state, error } : a,
        ),
      }));
    },

    setPreflight(preflight) {
      set({ preflight });
    },
  };
});
