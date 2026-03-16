import { create } from "zustand";
import {
  PRESET_AGENTS,
  type AgentConfig,
  type AgentConnectionState,
} from "@anthropic-ai/acp-browser-shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentWithState extends AgentConfig {
  connectionState: AgentConnectionState;
  error?: string;
}

export interface AgentState {
  currentAgentId: string;
  agents: AgentWithState[];

  // Actions
  switchAgent: (agentId: string) => void;
  addCustomAgent: (config: AgentConfig) => Promise<void>;
  removeCustomAgent: (agentId: string) => Promise<void>;
  updateAgentState: (agentId: string, state: AgentConnectionState, error?: string) => void;
}

// ---------------------------------------------------------------------------
// Persistence helpers (chrome.storage.local for custom agents)
// ---------------------------------------------------------------------------

const STORAGE_KEY_CUSTOM_AGENTS = "acp:customAgents";
const STORAGE_KEY_CURRENT_AGENT = "acp:currentAgentId";

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
    return (result[STORAGE_KEY_CURRENT_AGENT] as string) ?? PRESET_AGENTS[0].id;
  } catch {
    return PRESET_AGENTS[0].id;
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
      : PRESET_AGENTS[0].id;
    set({ agents: allAgents, currentAgentId: validId });
  })();

  return {
    currentAgentId: PRESET_AGENTS[0].id,
    agents: PRESET_AGENTS.map(toAgentWithState),

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
        currentAgentId === agentId ? PRESET_AGENTS[0].id : currentAgentId;

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
  };
});
