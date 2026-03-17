import { create } from "zustand";
import { DEFAULT_WS_URL, DEFAULT_MCP_PORT } from "@anthropic-ai/acp-browser-shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionMode = "always-ask" | "plan-approval" | "auto-execute";
export type PermissionLevel = "allow" | "deny" | "ask";
export type ThemeMode = "dark" | "light" | "system";

export interface SettingsState {
  permissionMode: PermissionMode;
  sitePermissions: Record<string, PermissionLevel>;
  theme: ThemeMode;
  proxyUrl: string;
  authToken: string;
  mcpPort: number;
  autoSnapshot: boolean;
  loaded: boolean;

  // Actions
  load: () => Promise<void>;
  setPermissionMode: (mode: PermissionMode) => Promise<void>;
  setSitePermission: (domain: string, level: PermissionLevel) => Promise<void>;
  removeSitePermission: (domain: string) => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setProxyUrl: (url: string) => Promise<void>;
  setAuthToken: (token: string) => Promise<void>;
  setMcpPort: (port: number) => Promise<void>;
  setAutoSnapshot: (enabled: boolean) => Promise<void>;
  getEffectivePermission: (domain: string) => PermissionLevel;
  getConnectUrl: () => string;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "acp:settings";

interface PersistedSettings {
  permissionMode: PermissionMode;
  sitePermissions: Record<string, PermissionLevel>;
  theme: ThemeMode;
  proxyUrl: string;
  authToken: string;
  mcpPort: number;
  autoSnapshot: boolean;
}

const DEFAULTS: PersistedSettings = {
  permissionMode: "always-ask",
  sitePermissions: {},
  theme: "system",
  proxyUrl: DEFAULT_WS_URL,
  authToken: "",
  mcpPort: DEFAULT_MCP_PORT,
  autoSnapshot: true,
};

async function loadSettings(): Promise<PersistedSettings> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as Partial<PersistedSettings> | undefined;
    return { ...DEFAULTS, ...stored };
  } catch {
    return DEFAULTS;
  }
}

async function saveSettings(settings: PersistedSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

function getPersistedSnapshot(state: SettingsState): PersistedSettings {
  return {
    permissionMode: state.permissionMode,
    sitePermissions: state.sitePermissions,
    theme: state.theme,
    proxyUrl: state.proxyUrl,
    authToken: state.authToken,
    mcpPort: state.mcpPort,
    autoSnapshot: state.autoSnapshot,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  async load() {
    if (get().loaded) return;
    const settings = await loadSettings();
    set({ ...settings, loaded: true });
  },

  async setPermissionMode(mode) {
    set({ permissionMode: mode });
    await saveSettings(getPersistedSnapshot(get()));
  },

  async setSitePermission(domain, level) {
    set((s) => ({
      sitePermissions: { ...s.sitePermissions, [domain]: level },
    }));
    await saveSettings(getPersistedSnapshot(get()));
  },

  async removeSitePermission(domain) {
    set((s) => {
      const { [domain]: _removed, ...rest } = s.sitePermissions;
      return { sitePermissions: rest };
    });
    await saveSettings(getPersistedSnapshot(get()));
  },

  async setTheme(theme) {
    set({ theme });
    await saveSettings(getPersistedSnapshot(get()));
  },

  async setProxyUrl(url) {
    set({ proxyUrl: url });
    await saveSettings(getPersistedSnapshot(get()));
  },

  async setAuthToken(token) {
    set({ authToken: token });
    await saveSettings(getPersistedSnapshot(get()));
  },

  async setMcpPort(port) {
    set({ mcpPort: port });
    await saveSettings(getPersistedSnapshot(get()));
  },

  async setAutoSnapshot(enabled) {
    set({ autoSnapshot: enabled });
    await saveSettings(getPersistedSnapshot(get()));
  },

  getConnectUrl() {
    const { proxyUrl, authToken } = get();
    const base = proxyUrl || DEFAULT_WS_URL;
    if (!authToken) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}token=${encodeURIComponent(authToken)}`;
  },

  getEffectivePermission(domain) {
    const { permissionMode, sitePermissions } = get();
    if (permissionMode === "auto-execute") return "allow";
    const siteLevel = sitePermissions[domain];
    if (siteLevel) return siteLevel;
    return permissionMode === "always-ask" ? "ask" : "ask";
  },
}));
