import { useState, useCallback } from "react";
import {
  useSettingsStore,
  type ThemeMode,
  type PermissionMode,
} from "../../store/settingsStore";
import { useAgentStore, type AgentWithState } from "../../store/agentStore";
import { DEFAULT_WS_URL, PRESET_AGENTS } from "@anthropic-ai/acp-browser-shared";
import type { AgentConfig } from "@anthropic-ai/acp-browser-shared";

interface SettingsPanelProps {
  onClose: () => void;
}

type SettingsTab = "general" | "agents" | "permissions" | "connection";

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const theme = useSettingsStore((s) => s.theme);
  const permissionMode = useSettingsStore((s) => s.permissionMode);
  const proxyUrl = useSettingsStore((s) => s.proxyUrl);
  const authToken = useSettingsStore((s) => s.authToken);
  const autoSnapshot = useSettingsStore((s) => s.autoSnapshot);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setPermissionMode = useSettingsStore((s) => s.setPermissionMode);
  const setProxyUrl = useSettingsStore((s) => s.setProxyUrl);
  const setAuthToken = useSettingsStore((s) => s.setAuthToken);
  const setAutoSnapshot = useSettingsStore((s) => s.setAutoSnapshot);

  const agents = useAgentStore((s) => s.agents);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "agents", label: "Agents" },
    { id: "permissions", label: "Permissions" },
    { id: "connection", label: "Connection" },
  ];

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Settings
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <line x1="4" y1="4" x2="12" y2="12" />
            <line x1="12" y1="4" x2="4" y2="12" />
          </svg>
        </button>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-border px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-[12px] border-b-2 transition-colors ${
              activeTab === tab.id
                ? "text-accent border-accent"
                : "text-text-secondary border-transparent hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "general" && (
          <GeneralSettings
            theme={theme}
            autoSnapshot={autoSnapshot}
            onThemeChange={setTheme}
            onAutoSnapshotChange={setAutoSnapshot}
          />
        )}
        {activeTab === "agents" && <AgentSettings agents={agents} />}
        {activeTab === "permissions" && (
          <PermissionSettings
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
          />
        )}
        {activeTab === "connection" && (
          <ConnectionSettings
            proxyUrl={proxyUrl}
            authToken={authToken}
            onProxyUrlChange={setProxyUrl}
            onAuthTokenChange={setAuthToken}
          />
        )}
      </div>
    </div>
  );
}

function GeneralSettings({
  theme,
  autoSnapshot,
  onThemeChange,
  onAutoSnapshotChange,
}: {
  theme: ThemeMode;
  autoSnapshot: boolean;
  onThemeChange: (theme: ThemeMode) => Promise<void>;
  onAutoSnapshotChange: (enabled: boolean) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <SettingSection title="Theme">
        <div className="flex gap-2">
          {(["dark", "light", "system"] as ThemeMode[]).map((t) => (
            <button
              key={t}
              onClick={() => void onThemeChange(t)}
              className={`px-3 py-1.5 text-[12px] rounded border transition-colors ${
                theme === t
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-text-secondary hover:border-border-light"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="Agent Browser Context">
        <label className="flex items-center justify-between text-[12px] text-text-secondary">
          <span>Auto snapshot browser state before each prompt</span>
          <input
            type="checkbox"
            checked={autoSnapshot}
            onChange={(e) => void onAutoSnapshotChange(e.target.checked)}
          />
        </label>
      </SettingSection>

      <SettingSection title="About">
        <div className="text-[12px] text-text-secondary space-y-1">
          <p>ACP Browser Client v0.1.0</p>
          <p>
            Agent Communication Protocol for browser-based AI agent interaction.
          </p>
        </div>
      </SettingSection>
    </div>
  );
}

function AgentSettings({ agents }: { agents: AgentWithState[] }) {
  const [editingAgent, setEditingAgent] = useState<Partial<AgentConfig> | null>(
    null,
  );

  const customAgents = agents.filter((a) => a.isCustom);
  const presetAgents = agents.filter((a) => !a.isCustom);

  return (
    <div className="space-y-6">
      <SettingSection title="Preset Agents">
        <div className="space-y-2">
          {presetAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-3 p-2 rounded bg-bg-secondary"
            >
              <span className="text-[16px]">{agent.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-text-primary">
                  {agent.name}
                </div>
                <div className="text-[10px] text-text-muted">
                  {agent.description}
                </div>
              </div>
              {agent.installInstructions && (
                <div className="text-[10px] text-text-muted shrink-0">
                  <code className="bg-bg-primary px-1 py-0.5 rounded text-[9px]">
                    {agent.command}
                  </code>
                </div>
              )}
            </div>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="Custom Agents">
        {customAgents.length > 0 && (
          <div className="space-y-2 mb-3">
            {customAgents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 p-2 rounded bg-bg-secondary"
              >
                <span className="text-[16px]">{agent.icon || "⚙️"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-text-primary">
                    {agent.name}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {agent.command} {agent.args.join(" ")}
                  </div>
                </div>
                <button
                  onClick={() =>
                    void useAgentStore
                      .getState()
                      .removeCustomAgent(agent.id)
                  }
                  className="p-1 text-text-muted hover:text-error transition-colors"
                  title="Remove agent"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <line x1="2" y1="2" x2="10" y2="10" />
                    <line x1="10" y1="2" x2="2" y2="10" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {editingAgent ? (
          <CustomAgentForm
            agent={editingAgent}
            onSave={(config) => {
              void useAgentStore
                .getState()
                .addCustomAgent(config as AgentConfig);
              setEditingAgent(null);
            }}
            onCancel={() => setEditingAgent(null)}
          />
        ) : (
          <button
            onClick={() =>
              setEditingAgent({
                id: "",
                name: "",
                description: "",
                command: "",
                args: [],
              })
            }
            className="w-full py-2 border border-dashed border-border-light rounded text-[12px] text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
          >
            + Add Custom Agent
          </button>
        )}
      </SettingSection>
    </div>
  );
}

function CustomAgentForm({
  agent,
  onSave,
  onCancel,
}: {
  agent: Partial<AgentConfig>;
  onSave: (agent: Partial<AgentConfig>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: agent.name || "",
    command: agent.command || "",
    args: agent.args?.join(" ") || "",
    description: agent.description || "",
    icon: agent.icon || "",
  });

  const handleSubmit = useCallback(() => {
    if (!form.name || !form.command) return;
    onSave({
      id: form.name.toLowerCase().replace(/\s+/g, "-"),
      name: form.name,
      command: form.command,
      args: form.args ? form.args.split(" ").filter(Boolean) : [],
      description: form.description,
      icon: form.icon || "⚙️",
      isCustom: true,
    });
  }, [form, onSave]);

  return (
    <div className="space-y-2 p-3 rounded bg-bg-secondary border border-border">
      <input
        type="text"
        placeholder="Agent name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="w-full bg-bg-input text-text-primary text-[12px] rounded px-2 py-1.5 border border-border focus:border-accent outline-none"
      />
      <input
        type="text"
        placeholder="Command (e.g., my-agent-acp)"
        value={form.command}
        onChange={(e) => setForm({ ...form, command: e.target.value })}
        className="w-full bg-bg-input text-text-primary text-[12px] rounded px-2 py-1.5 border border-border focus:border-accent outline-none"
      />
      <input
        type="text"
        placeholder="Arguments (space separated)"
        value={form.args}
        onChange={(e) => setForm({ ...form, args: e.target.value })}
        className="w-full bg-bg-input text-text-primary text-[12px] rounded px-2 py-1.5 border border-border focus:border-accent outline-none"
      />
      <input
        type="text"
        placeholder="Description"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className="w-full bg-bg-input text-text-primary text-[12px] rounded px-2 py-1.5 border border-border focus:border-accent outline-none"
      />
      <input
        type="text"
        placeholder="Icon (emoji)"
        value={form.icon}
        onChange={(e) => setForm({ ...form, icon: e.target.value })}
        className="w-20 bg-bg-input text-text-primary text-[12px] rounded px-2 py-1.5 border border-border focus:border-accent outline-none"
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={!form.name || !form.command}
          className="px-3 py-1 text-[11px] rounded bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-30"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-[11px] rounded bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PermissionSettings({
  permissionMode,
  onPermissionModeChange,
}: {
  permissionMode: PermissionMode;
  onPermissionModeChange: (mode: PermissionMode) => Promise<void>;
}) {
  const modes: { id: PermissionMode; label: string; description: string }[] = [
    {
      id: "always-ask",
      label: "Ask Every Time",
      description: "Prompt for permission on each action",
    },
    {
      id: "plan-approval",
      label: "Plan Approval",
      description: "Approve the plan, auto-allow steps within it",
    },
    {
      id: "auto-execute",
      label: "Auto Execute",
      description: "Automatically allow all actions (less secure)",
    },
  ];

  return (
    <div className="space-y-6">
      <SettingSection title="Permission Mode">
        <div className="space-y-2">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => void onPermissionModeChange(mode.id)}
              className={`w-full flex items-start gap-3 p-3 rounded border text-left transition-colors ${
                permissionMode === mode.id
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-border-light"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                  permissionMode === mode.id
                    ? "border-accent"
                    : "border-text-muted"
                }`}
              >
                {permissionMode === mode.id && (
                  <div className="w-2 h-2 rounded-full bg-accent" />
                )}
              </div>
              <div>
                <div className="text-[12px] text-text-primary font-medium">
                  {mode.label}
                </div>
                <div className="text-[11px] text-text-muted">
                  {mode.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="Site Permissions">
        <p className="text-[11px] text-text-muted">
          Per-site permission overrides will appear here as you use "Always
          Allow" on permission prompts.
        </p>
      </SettingSection>
    </div>
  );
}

function ConnectionSettings({
  proxyUrl,
  authToken,
  onProxyUrlChange,
  onAuthTokenChange,
}: {
  proxyUrl: string;
  authToken: string;
  onProxyUrlChange: (url: string) => Promise<void>;
  onAuthTokenChange: (token: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(proxyUrl || "");
  const [token, setToken] = useState(authToken || "");

  return (
    <div className="space-y-6">
      <SettingSection title="Proxy Server URL">
        <div className="space-y-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_WS_URL}
            className="w-full bg-bg-input text-text-primary text-[12px] rounded px-3 py-2 border border-border focus:border-accent outline-none font-mono"
          />
          <p className="text-[10px] text-text-muted">Default: {DEFAULT_WS_URL}</p>
        </div>
      </SettingSection>

      <SettingSection title="Auth Token">
        <div className="space-y-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste token from proxy server console"
            className="w-full bg-bg-input text-text-primary text-[12px] rounded px-3 py-2 border border-border focus:border-accent outline-none font-mono"
          />
          <p className="text-[10px] text-text-muted">
            Find it in the proxy server startup output, or at ~/.acp-browser-client/auth-token
          </p>
        </div>
      </SettingSection>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            void onProxyUrlChange(url);
            void onAuthTokenChange(token);
          }}
          className="px-3 py-1.5 text-[11px] rounded bg-accent hover:bg-accent-hover text-white transition-colors"
        >
          Save & Reconnect
        </button>
        <button
          onClick={() => {
            setUrl("");
            setToken("");
            void onProxyUrlChange("");
            void onAuthTokenChange("");
          }}
          className="px-3 py-1.5 text-[11px] rounded bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
        >
          Reset to Default
        </button>
      </div>

      <SettingSection title="Connection Info">
        <div className="text-[11px] text-text-secondary space-y-1">
          <p>
            The proxy server bridges this extension with ACP-compatible agents
            running locally.
          </p>
          <p>
            Start the proxy server first, then copy the auth token:
          </p>
          <code className="block bg-bg-secondary rounded p-2 text-[11px] text-accent mt-1">
            npx tsx packages/proxy-server/src/index.ts
          </code>
        </div>
      </SettingSection>
    </div>
  );
}

function SettingSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold text-text-primary mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}
