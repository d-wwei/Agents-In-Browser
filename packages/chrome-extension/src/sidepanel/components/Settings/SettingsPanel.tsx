import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { X, Trash2, Plus, Save, RotateCcw, Shield, Eye, EyeOff, Bot, Code } from "lucide-react";
import {
  useSettingsStore,
  type ThemeMode,
  type PermissionMode,
  type AgentToolPermissionMode,
} from "../../store/settingsStore";
import { useAgentStore, type AgentWithState } from "../../store/agentStore";
import { DEFAULT_WS_URL } from "@anthropic-ai/agents-in-browser-shared";
import { PRESET_AGENTS, type AgentConfig } from "@anthropic-ai/agents-in-browser-shared";

export type SettingsPanelTab = "general" | "agents" | "permissions" | "connection";

interface SettingsPanelProps {
  onClose: () => void;
  onReconnect: () => void;
  initialTab?: SettingsPanelTab;
}

export default function SettingsPanel({
  onClose,
  onReconnect,
  initialTab = "general",
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsPanelTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const theme = useSettingsStore((s) => s.theme);
  const permissionMode = useSettingsStore((s) => s.permissionMode);
  const proxyUrl = useSettingsStore((s) => s.proxyUrl);
  const authToken = useSettingsStore((s) => s.authToken);
  const autoSnapshot = useSettingsStore((s) => s.autoSnapshot);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setPermissionMode = useSettingsStore((s) => s.setPermissionMode);
  const agentToolPermission = useSettingsStore((s) => s.agentToolPermission);
  const setAgentToolPermission = useSettingsStore((s) => s.setAgentToolPermission);
  const setProxyUrl = useSettingsStore((s) => s.setProxyUrl);
  const setAuthToken = useSettingsStore((s) => s.setAuthToken);
  const setAutoSnapshot = useSettingsStore((s) => s.setAutoSnapshot);

  const agents = useAgentStore((s) => s.agents);

  const tabs: { id: SettingsPanelTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "agents", label: "Agents" },
    { id: "permissions", label: "Permissions" },
    { id: "connection", label: "Connection" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--background)" }}>
      {/* Header — h=48, px=16, border-bottom, space-between */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 48, padding: "0 16px", flexShrink: 0,
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>Settings</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center" }}
          aria-label="Close settings"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tab Bar — px=16, gap=4, border-bottom */}
      <div
        style={{
          display: "flex", gap: 4, padding: "0 16px", flexShrink: 0,
          borderBottom: "1px solid var(--border)",
        }}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "10px 12px",
                fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                color: isActive ? "var(--accent)" : "var(--muted-foreground)",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                whiteSpace: "nowrap",
              }}
              role="tab"
              aria-selected={isActive}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content — p=16, gap=16, scrollable */}
      <div
        style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}
        role="tabpanel"
      >
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
            agentToolPermission={agentToolPermission}
            onAgentToolPermissionChange={setAgentToolPermission}
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

/* ── Card wrapper ── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--card)",
      borderRadius: 12,
      border: "1px solid var(--border-card, rgba(255,255,255,0.19))",
      boxShadow: "0 2px 8px rgba(0,0,0,0.19)",
      padding: 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ── General Settings ── */
function GeneralSettings({
  theme, autoSnapshot, onThemeChange, onAutoSnapshotChange,
}: {
  theme: ThemeMode;
  autoSnapshot: boolean;
  onThemeChange: (theme: ThemeMode) => Promise<void>;
  onAutoSnapshotChange: (enabled: boolean) => Promise<void>;
}) {
  const themes: { id: ThemeMode; label: string }[] = [
    { id: "dark", label: "Dark" },
    { id: "light", label: "Light" },
    { id: "system", label: "System" },
  ];

  return (
    <>
      {/* Theme Card — gap 12 */}
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Theme</span>
        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          {themes.map((t) => {
            const isActive = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => void onThemeChange(t.id)}
                style={{
                  flex: 1, height: 36, borderRadius: 8, cursor: "pointer",
                  fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                  background: isActive ? "rgba(110,231,183,0.1)" : "none",
                  border: isActive ? "1px solid rgba(110,231,183,0.4)" : "1px solid var(--border)",
                  color: isActive ? "var(--accent)" : "var(--muted-foreground)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Context Card */}
      <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
            Agent Browser Context
          </span>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Auto snapshot browser state before each prompt
          </span>
        </div>
        <Toggle checked={autoSnapshot} onChange={(v) => void onAutoSnapshotChange(v)} />
      </Card>

      {/* About Card — gap 8 */}
      <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>About</span>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Agents In Browser v0.1.0
        </span>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Agent Communication Protocol for browser-based AI agent interaction.
        </span>
      </Card>
    </>
  );
}

function parseSpaceSeparatedArgs(line: string): string[] {
  const t = line.trim();
  if (!t) return [];
  return t.split(/\s+/).filter(Boolean);
}

/** One KEY=value per line; # starts a comment line */
function parseEnvLines(block: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function envToLines(env: Record<string, string> | undefined): string {
  if (!env || Object.keys(env).length === 0) return "";
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function slugId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
  return (base || "custom") + "-" + Math.random().toString(36).slice(2, 6);
}

/* ── Agent Settings ── */
function AgentSettings({ agents }: { agents: AgentWithState[] }) {
  const [editingAgent, setEditingAgent] = useState<Partial<AgentConfig> | null>(null);
  const customAgents = agents.filter((a) => a.isCustom);
  const presetAgents = agents.filter((a) => !a.isCustom);

  const iconConfigs = [
    { icon: <Bot size={16} className="text-accent" />, bg: "rgba(110,231,183,0.1)" },
    { icon: <Code size={16} style={{ color: "#6366f1" }} />, bg: "rgba(99,102,241,0.1)" },
  ];

  return (
    <>
      {/* Installed Agents — gap 12 */}
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Installed Agents</span>
        {presetAgents.map((agent, i) => {
          const ic = iconConfigs[i % iconConfigs.length];
          return (
            <div key={agent.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 8,
              border: "1px solid var(--border)",
              background: i === 0 ? "var(--bg-hover, #252833)" : undefined,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: ic.bg,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {ic.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{agent.name}</span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{agent.description}</span>
              </div>
              <Trash2 size={14} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
            </div>
          );
        })}
        {customAgents.map((agent) => (
          <div key={agent.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 8,
            border: "1px solid var(--border)",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(110,231,183,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Bot size={16} className="text-accent" />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{agent.name}</span>
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                {agent.description || `${agent.command} ${agent.args?.join(" ") ?? ""}`}
              </span>
            </div>
            <button
              onClick={() => void useAgentStore.getState().removeCustomAgent(agent.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}
              aria-label={`Remove ${agent.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </Card>

      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Add Custom Agent</span>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, margin: 0 }}>
          ACP Agent 是本地可执行程序（与终端里启动的命令相同），不是网页 URL。可从下方预设一键填好命令，再改显示名称即可。
        </p>
        {editingAgent ? (
          <CustomAgentForm
            agent={editingAgent}
            onSave={(config) => {
              void useAgentStore.getState().addCustomAgent(config as AgentConfig);
              setEditingAgent(null);
            }}
            onCancel={() => setEditingAgent(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() =>
              setEditingAgent({ id: "", name: "", description: "", command: "", args: [] })
            }
            style={{
              width: "100%", height: 36, borderRadius: 8, cursor: "pointer",
              background: "var(--accent)", color: "var(--primary-foreground)",
              border: "none", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Plus size={14} />
            填写并添加
          </button>
        )}
      </Card>
    </>
  );
}

function CustomAgentForm({
  agent, onSave, onCancel,
}: {
  agent: Partial<AgentConfig>;
  onSave: (agent: Partial<AgentConfig>) => void;
  onCancel: () => void;
}) {
  const [templateId, setTemplateId] = useState<string>("");
  const [form, setForm] = useState({
    name: agent.name || "",
    command: agent.command || "",
    cwd: agent.cwd || "",
    envLines: envToLines(agent.env),
    description: agent.description || "",
    argsLine: (agent.args && agent.args.length > 0 ? agent.args.join(" ") : "") as string,
  });

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const preset = PRESET_AGENTS.find((a) => a.id === id);
    if (!preset) return;
    setForm((f) => ({
      ...f,
      command: preset.command,
      argsLine: preset.args.join(" "),
      description: f.description || preset.description,
      name: f.name || preset.name + " (自定义)",
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FormField label="从预设填充（可选）" id="caf-template">
        <select
          id="caf-template"
          className="input-field"
          style={{ fontSize: 12, width: "100%" }}
          value={templateId}
          onChange={(e) => applyTemplate(e.target.value)}
        >
          <option value="">— 手动填写命令 —</option>
          {PRESET_AGENTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.command}）
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="显示名称" id="caf-name">
        <input id="caf-name" type="text" placeholder="例如：我的 Claude Code" className="input-field" style={{ fontSize: 12 }}
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </FormField>
      <FormField label="可执行命令" id="caf-cmd">
        <input id="caf-cmd" type="text" placeholder="终端里 which 到的命令名，如 claude-code-acp" className="input-field" style={{ fontSize: 12 }}
          value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
      </FormField>
      <FormField label="参数（可选，空格分隔）" id="caf-args">
        <input id="caf-args" type="text" placeholder='例如：--experimental-acp  或留空' className="input-field" style={{ fontSize: 12 }}
          value={form.argsLine} onChange={(e) => setForm({ ...form, argsLine: e.target.value })} />
      </FormField>
      <FormField label="工作目录（可选）" id="caf-cwd">
        <input
          id="caf-cwd"
          type="text"
          placeholder="fork 仓库根目录等；留空则用 Proxy 当前目录"
          className="input-field"
          style={{ fontSize: 12 }}
          value={form.cwd}
          onChange={(e) => setForm({ ...form, cwd: e.target.value })}
        />
      </FormField>
      <FormField
        label="更多环境变量（可选）"
        id="caf-env"
        hint="高级用法：每行 KEY=value，例如设置底层可执行文件、API 地址或调试开关。"
      >
        <textarea
          id="caf-env"
          className="input-field"
          style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
          placeholder={"# 每行 KEY=value，例如：\n# CLAUDE_CODE_EXECUTABLE=/path/to/cli\n# FOO=bar"}
          value={form.envLines}
          onChange={(e) => setForm({ ...form, envLines: e.target.value })}
        />
      </FormField>
      <FormField label="描述（可选）" id="caf-desc">
        <input id="caf-desc" type="text" placeholder="简短说明" className="input-field" style={{ fontSize: 12 }}
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FormField>
      <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
        <button
          type="button"
          onClick={() => {
            const cmd = form.command.trim();
            if (!form.name.trim() || !cmd) return;
            onSave({
              id: slugId(form.name),
              name: form.name.trim(),
              command: cmd,
              args: parseSpaceSeparatedArgs(form.argsLine),
              ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
              ...(() => {
                const env = parseEnvLines(form.envLines);
                return env ? { env } : {};
              })(),
              description: form.description.trim() || `Custom: ${cmd}`,
              icon: "⚙️",
              isCustom: true,
            });
          }}
          disabled={!form.name.trim() || !form.command.trim()}
          style={{
            flex: 1, height: 36, borderRadius: 8, cursor: "pointer",
            background: "var(--accent)", color: "var(--primary-foreground)",
            border: "none", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            opacity: !form.name.trim() || !form.command.trim() ? 0.3 : 1,
          }}
        >
          <Plus size={14} /> 保存
        </button>
        <button type="button" onClick={onCancel} style={{
          flex: 1, height: 36, borderRadius: 8, cursor: "pointer",
          background: "none", border: "1px solid var(--border)",
          fontSize: 12, fontWeight: 500, fontFamily: "inherit", color: "var(--muted-foreground)",
        }}>
          取消
        </button>
      </div>
    </div>
  );
}

function modeButtonStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 8,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: active ? "rgba(110,231,183,0.12)" : "transparent",
    color: active ? "var(--accent)" : "var(--muted-foreground)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "center" as const,
    lineHeight: 1.35,
  };
}

/* ── Permission Settings ── */
function PermissionSettings({
  permissionMode,
  onPermissionModeChange,
  agentToolPermission,
  onAgentToolPermissionChange,
}: {
  permissionMode: PermissionMode;
  onPermissionModeChange: (mode: PermissionMode) => Promise<void>;
  agentToolPermission: AgentToolPermissionMode;
  onAgentToolPermissionChange: (mode: AgentToolPermissionMode) => Promise<void>;
}) {
  const permissions = [
    { id: "page-content", label: "Page Content", desc: "Read and extract page content", defaultOn: true },
    { id: "navigation", label: "Navigation", desc: "Navigate to URLs and pages", defaultOn: true },
    { id: "tab-management", label: "Tab Management", desc: "Create, close, and switch tabs", defaultOn: false },
    { id: "screenshots", label: "Screenshots", desc: "Capture visible page screenshots", defaultOn: true },
  ];
  const [permStates, setPermStates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(permissions.map((p) => [p.id, p.defaultOn]))
  );

  return (
    <>
      <div style={{
        display: "flex", gap: 8, padding: 12, borderRadius: 8,
        background: "rgba(110,231,183,0.05)",
        border: "1px solid rgba(110,231,183,0.2)",
      }}>
        <Shield size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          下方设置会同步到本机 Proxy。连接中修改后会立即生效。
        </span>
      </div>

      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
          Agent 工具审批（如 Claude Code 的 Bash）
        </span>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          控制编码 Agent 在运行终端命令等敏感操作前是否弹出确认。选择「自动允许」后不再弹窗（由 Proxy 自动回复允许，请仅在可信环境使用）。
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={modeButtonStyle(agentToolPermission === "ask")}
            onClick={() => void onAgentToolPermissionChange("ask")}
          >
            每次询问
          </button>
          <button
            type="button"
            style={modeButtonStyle(agentToolPermission === "auto_always")}
            onClick={() => void onAgentToolPermissionChange("auto_always")}
          >
            自动允许（无需审批）
          </button>
        </div>
      </Card>

      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
          浏览器工具执行策略
        </span>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          通过扩展 API 操作标签页、截图等时的默认策略。「自动执行」下尽量不再拦截（仍受站点规则影响）。
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            style={modeButtonStyle(permissionMode === "always-ask")}
            onClick={() => void onPermissionModeChange("always-ask")}
          >
            每次询问
          </button>
          <button
            type="button"
            style={modeButtonStyle(permissionMode === "plan-approval")}
            onClick={() => void onPermissionModeChange("plan-approval")}
          >
            计划确认（预留）
          </button>
          <button
            type="button"
            style={modeButtonStyle(permissionMode === "auto-execute")}
            onClick={() => void onPermissionModeChange("auto-execute")}
          >
            自动执行
          </button>
        </div>
      </Card>

      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Browser Permissions</span>
        {permissions.map((perm, i) => (
          <div key={perm.id}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{perm.label}</span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{perm.desc}</span>
              </div>
              <Toggle checked={permStates[perm.id]} onChange={(v) => setPermStates({ ...permStates, [perm.id]: v })} />
            </div>
            {i < permissions.length - 1 && (
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 12 }} />
            )}
          </div>
        ))}
      </Card>
    </>
  );
}

/* ── Connection Settings ── */
function ConnectionSettings({
  proxyUrl, authToken, onProxyUrlChange, onAuthTokenChange, onReconnect,
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
    <>
      {/* Server Connection — gap 14 */}
      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Server Connection</span>
        <FormField label="Proxy Server URL" id="proxy-url">
          <input id="proxy-url" type="text" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_WS_URL} className="input-field" style={{ fontSize: 12 }} />
        </FormField>
        <FormField label="Auth Token" id="auth-token">
          <div style={{ position: "relative" }}>
            <input id="auth-token" type={showToken ? "text" : "password"} value={token}
              onChange={(e) => setToken(e.target.value)} placeholder="Paste token from proxy server"
              className="input-field" style={{ fontSize: 12, paddingRight: 36 }} />
            <button type="button" onClick={() => setShowToken(!showToken)}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--muted-foreground)", display: "flex", alignItems: "center",
              }}
              aria-label={showToken ? "Hide token" : "Show token"}>
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </FormField>
        <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
          <button
            onClick={async () => { await onProxyUrlChange(url); await onAuthTokenChange(token); onReconnect(); }}
            style={{
              flex: 1, height: 36, borderRadius: 8, cursor: "pointer",
              background: "var(--accent)", color: "var(--primary-foreground)",
              border: "none", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            <Save size={14} /> Save
          </button>
          <button
            onClick={() => { setUrl(""); setToken(""); void onProxyUrlChange(""); void onAuthTokenChange(""); }}
            style={{
              flex: 1, height: 36, borderRadius: 8, cursor: "pointer",
              background: "none", border: "1px solid var(--border)",
              fontSize: 12, fontWeight: 500, fontFamily: "inherit", color: "var(--muted-foreground)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </Card>

      {/* Connection Info — gap 10 */}
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Connection Info</span>
        <InfoRow label="Status">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: connState === "connected" ? "var(--success, #6ee7b7)" : "var(--muted-foreground)",
            }} />
            <span style={{ color: connState === "connected" ? "var(--success, #6ee7b7)" : "var(--muted-foreground)" }}>
              {connState.charAt(0).toUpperCase() + connState.slice(1)}
            </span>
          </span>
        </InfoRow>
        <InfoRow label="Server"><span style={{ color: "var(--foreground)" }}>{url || "localhost:3000"}</span></InfoRow>
        <InfoRow label="Protocol"><span style={{ color: "var(--foreground)" }}>SSE</span></InfoRow>
        <InfoRow label="Last Connect"><span style={{ color: "var(--muted-foreground)" }}>Never</span></InfoRow>
      </Card>
    </>
  );
}

/* ── Shared components ── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{
        position: "relative", width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", flexShrink: 0,
        background: checked ? "rgba(110,231,183,0.3)" : "var(--bg-hover, #252833)",
      }}>
      <span style={{
        position: "absolute", top: 3, width: 16, height: 16, borderRadius: "50%",
        background: checked ? "var(--accent, #6ee7b7)" : "var(--muted-foreground, #6b7280)",
        left: checked ? 21 : 3, transition: "left 0.2s, background 0.2s",
      }} />
    </button>
  );
}

function FormField({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)" }}>{label}</label>
      {hint ? (
        <span style={{ fontSize: 10, color: "var(--muted-foreground)", lineHeight: 1.4, marginTop: -2 }}>{hint}</span>
      ) : null}
      {children}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      {children}
    </div>
  );
}
