import { useState, useCallback } from "react";
import { X, Trash2, Plus, Save, RotateCcw, Shield } from "lucide-react";
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
  onReconnect: () => void;
}

type SettingsTab = "general" | "agents" | "permissions" | "connection";

export default function SettingsPanel({ onClose, onReconnect }: SettingsPanelProps) {
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
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 48,
          background: "#1e2640",
          borderBottom: "1px solid rgba(255,255,255,0.22)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        <h2 className="text-[15px] font-semibold text-text-primary">
          Settings
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          aria-label="Close settings"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Tab navigation */}
      <div
        className="flex px-4 gap-1 overflow-x-auto shrink-0"
        style={{
          background: "#1a2038",
          borderBottom: "1px solid rgba(255,255,255,0.15)",
        }}
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2.5 text-[12px] font-medium border-b-2 whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              activeTab === tab.id
                ? "text-accent border-accent"
                : "text-text-muted border-transparent hover:text-text-primary"
            }`}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4" role="tabpanel">
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
            onReconnect={onReconnect}
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
    <div className="space-y-4">
      <SettingCard title="Theme">
        <div className="flex gap-3" role="radiogroup" aria-label="Theme selection">
          {(["dark", "light", "system"] as ThemeMode[]).map((t) => (
            <button
              key={t}
              onClick={() => void onThemeChange(t)}
              className={`flex-1 h-9 text-[12px] font-medium rounded-lg border transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none ${
                theme === t
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-border text-text-secondary hover:border-border-light hover:text-text-primary"
              }`}
              role="radio"
              aria-checked={theme === t}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </SettingCard>

      <div className="glass-card p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex flex-col" style={{ gap: 4 }}>
            <span className="text-[13px] font-semibold text-text-primary">
              Agent Browser Context
            </span>
            <span className="text-[12px] text-text-secondary leading-relaxed">
              Auto snapshot browser state before each prompt
            </span>
          </div>
          <div className="relative shrink-0 ml-4">
            <input
              type="checkbox"
              checked={autoSnapshot}
              onChange={(e) => void onAutoSnapshotChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-[22px] rounded-full bg-bg-hover peer-checked:bg-accent/30 transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50" />
            <div className="absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-text-muted peer-checked:bg-accent peer-checked:translate-x-[18px] transition-all duration-150" />
          </div>
        </label>
      </div>

      <SettingCard title="About" titleGap={8}>
        <div className="flex flex-col text-[12px] text-text-secondary leading-relaxed" style={{ gap: 8 }}>
          <p>ACP Browser Client v0.1.0</p>
          <p>
            Agent Communication Protocol for browser-based AI agent interaction.
          </p>
        </div>
      </SettingCard>
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
    <div className="space-y-4">
      <SettingCard title="Installed Agents">
        <div className="flex flex-col" style={{ gap: 12 }}>
          {presetAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center rounded-lg bg-bg-hover border border-border"
              style={{ gap: 10, padding: "10px 12px" }}
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-[14px] shrink-0">
                {agent.icon || "🤖"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary font-medium">
                  {agent.name}
                </div>
                <div className="text-[11px] text-text-secondary" style={{ marginTop: 2 }}>
                  {agent.description}
                </div>
              </div>
            </div>
          ))}
          {customAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center rounded-lg border border-border"
              style={{ gap: 10, padding: "10px 12px" }}
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-[14px] shrink-0">
                {agent.icon || "⚙️"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary font-medium">
                  {agent.name}
                </div>
                <div className="text-[11px] text-text-secondary" style={{ marginTop: 2 }}>
                  {agent.command} {agent.args?.join(" ") ?? ""}
                </div>
              </div>
              <button
                onClick={() =>
                  void useAgentStore.getState().removeCustomAgent(agent.id)
                }
                className="p-1.5 text-text-muted hover:text-error transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none rounded-lg"
                aria-label={`Remove agent ${agent.name}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </SettingCard>

      <SettingCard title="Add Custom Agent" titleGap={14}>
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
          <div className="space-y-3">
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
              className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-hover text-bg-primary text-[12px] font-semibold transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
            >
              <Plus size={14} aria-hidden="true" />
              Add Agent
            </button>
          </div>
        )}
      </SettingCard>
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
    <div className="flex flex-col" style={{ gap: 14 }}>
      <FormField label="Agent Name" id="agent-name">
        <input
          id="agent-name"
          type="text"
          placeholder="Enter agent name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="input-field"
        />
      </FormField>
      <FormField label="Command" id="agent-command">
        <input
          id="agent-command"
          type="text"
          placeholder="my-agent-acp"
          value={form.command}
          onChange={(e) => setForm({ ...form, command: e.target.value })}
          className="input-field"
        />
      </FormField>
      <FormField label="Arguments" id="agent-args">
        <input
          id="agent-args"
          type="text"
          placeholder="Space separated arguments"
          value={form.args}
          onChange={(e) => setForm({ ...form, args: e.target.value })}
          className="input-field"
        />
      </FormField>
      <FormField label="Description" id="agent-description">
        <input
          id="agent-description"
          type="text"
          placeholder="What this agent does"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="input-field"
        />
      </FormField>
      <div className="flex pt-1" style={{ gap: 10 }}>
        <button
          onClick={handleSubmit}
          disabled={!form.name || !form.command}
          className="flex-1 h-9 flex items-center justify-center rounded-lg bg-accent hover:bg-accent-hover text-bg-primary text-[12px] font-semibold transition-colors duration-150 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          style={{ gap: 6 }}
        >
          <Save size={14} aria-hidden="true" />
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex-1 h-9 rounded-lg border border-border text-[12px] text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
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
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div
        className="flex rounded-lg items-start"
        style={{
          gap: 8,
          padding: 12,
          background: "rgba(110,231,183,0.05)",
          border: "1px solid rgba(110,231,183,0.2)",
          borderRadius: 8,
        }}
      >
        <Shield size={16} className="text-accent shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[12px] text-text-secondary leading-[1.5]">
          Control which browser capabilities AI agents can access. Changes take effect immediately.
        </p>
      </div>

      <SettingCard title="Permission Mode">
        <div className="flex flex-col" style={{ gap: 12 }} role="radiogroup" aria-label="Permission mode">
          {modes.map((mode, index) => (
            <div key={mode.id}>
              <button
                onClick={() => void onPermissionModeChange(mode.id)}
                className="w-full flex items-center justify-between text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded"
                role="radio"
                aria-checked={permissionMode === mode.id}
              >
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span className="text-[13px] text-text-primary font-medium">
                    {mode.label}
                  </span>
                  <span className="text-[11px] text-text-secondary">
                    {mode.description}
                  </span>
                </div>
                <div className="shrink-0 ml-4 relative" style={{ width: 40, height: 22 }}>
                  <div
                    className="w-full h-full rounded-full transition-colors duration-150"
                    style={{
                      background: permissionMode === mode.id ? "rgba(110,231,183,0.3)" : "var(--color-bg-hover)",
                    }}
                  />
                  <div
                    className="absolute top-[3px] w-4 h-4 rounded-full transition-all duration-150"
                    style={{
                      left: permissionMode === mode.id ? 21 : 3,
                      background: permissionMode === mode.id ? "var(--color-accent)" : "var(--color-text-muted)",
                    }}
                  />
                </div>
              </button>
              {index < modes.length - 1 && (
                <div className="border-t border-border" style={{ marginTop: 12 }} />
              )}
            </div>
          ))}
        </div>
      </SettingCard>
    </div>
  );
}

function ConnectionSettings({
  proxyUrl,
  authToken,
  onProxyUrlChange,
  onAuthTokenChange,
  onReconnect,
}: {
  proxyUrl: string;
  authToken: string;
  onProxyUrlChange: (url: string) => Promise<void>;
  onAuthTokenChange: (token: string) => Promise<void>;
  onReconnect: () => void;
}) {
  const [url, setUrl] = useState(proxyUrl || "");
  const [token, setToken] = useState(authToken || "");
  const [showToken, setShowToken] = useState(false);

  const agentId = useAgentStore((s) => s.currentAgentId);
  const agents = useAgentStore((s) => s.agents);
  const currentAgent = agents.find((a) => a.id === agentId);
  const connState = currentAgent?.connectionState ?? "disconnected";

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <SettingCard title="Server Connection" titleGap={14}>
        <div className="flex flex-col" style={{ gap: 14 }}>
          <FormField label="Proxy Server URL" id="proxy-url">
            <input
              id="proxy-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={DEFAULT_WS_URL}
              className="input-field font-mono"
            />
          </FormField>

          <FormField label="Auth Token" id="auth-token">
            <div className="relative">
              <input
                id="auth-token"
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token from proxy server"
                className="input-field font-mono pr-9"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showToken ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </>
                  )}
                </svg>
              </button>
            </div>
          </FormField>

          <div className="flex" style={{ gap: 10, paddingTop: 4 }}>
            <button
              onClick={async () => {
                await onProxyUrlChange(url);
                await onAuthTokenChange(token);
                onReconnect();
              }}
              className="flex-1 h-9 flex items-center justify-center rounded-lg bg-accent hover:bg-accent-hover text-bg-primary text-[12px] font-semibold transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
              style={{ gap: 6 }}
            >
              <Save size={14} aria-hidden="true" />
              Save
            </button>
            <button
              onClick={() => {
                setUrl("");
                setToken("");
                void onProxyUrlChange("");
                void onAuthTokenChange("");
              }}
              className="flex-1 h-9 flex items-center justify-center rounded-lg border border-border text-[12px] text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
              style={{ gap: 6 }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset
            </button>
          </div>
        </div>
      </SettingCard>

      <SettingCard title="Connection Info" titleGap={10}>
        <div className="flex flex-col" style={{ gap: 10 }}>
          <InfoRow label="Status">
            <span className="flex items-center" style={{ gap: 6 }}>
              <span className={`w-2 h-2 rounded-full ${
                connState === "connected" ? "bg-accent glow-accent" : "bg-text-muted"
              }`} />
              <span className={connState === "connected" ? "text-accent" : "text-text-muted"}>
                {connState.charAt(0).toUpperCase() + connState.slice(1)}
              </span>
            </span>
          </InfoRow>
          <InfoRow label="Server">
            <span className="text-text-primary">
              {url || "localhost:3000"}
            </span>
          </InfoRow>
          <InfoRow label="Protocol">
            <span className="text-text-primary">SSE</span>
          </InfoRow>
        </div>
      </SettingCard>
    </div>
  );
}

function SettingCard({
  title,
  children,
  titleGap = 12,
}: {
  title: string;
  children: React.ReactNode;
  titleGap?: number;
}) {
  return (
    <div className="glass-card p-4">
      <h3
        className="text-[13px] font-semibold text-text-primary"
        style={{ marginBottom: titleGap }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function FormField({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <label htmlFor={id} className="block text-[11px] text-text-muted font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center text-[12px]">
      <span className="text-text-secondary">{label}</span>
      {children}
    </div>
  );
}
