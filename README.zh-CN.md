# Agents In Browser 使用说明

[English](./README.md)

![Agents In Browser](./assets/readme-cover.png)

一个本地运行的「浏览器扩展 + Proxy + ACP Agent」系统，让你在浏览器侧边栏中通过自然语言驱动 AI Agent，并安全地执行网页读取、导航、截图、标签页管理等操作。

## 为什么做这个产品

很多 AI 浏览器插件擅长“网页内问答”，但一旦任务需要同时操作浏览器和本地环境（代码、命令行、文件系统）就会断层。  
`Agents In Browser` 的目标就是打通这条链路：

- 把浏览器操作与本地 Agent 执行放到同一个任务闭环里
- Agent 可以基于网页上下文继续完成本地开发流程
- 核心执行权放在本地环境，而不是被固定在单一云端插件流程

## 和其他 AI 浏览器插件的核心区别

最重要的区别是：**桥接本地 Agent**。

- **浏览器 + 本地环境一体化**：同一个任务可在网页操作与本地执行之间无缝切换。
- **LLM Token 来源更灵活**：通过桥接本地 Agent（Claude Code / Codex / Gemini / 自定义 ACP Agent），你可以按需选择模型与 token 来源策略，不被某一个插件后端绑定。
- **运行时更可控**：Agent 命令、参数和环境都可本地配置与扩展。
- **隐私与治理能力更强**：敏感上下文可留在本地工作流中。

---

## 已集成的 Kit

| Kit | 职责 | 状态 |
|-----|------|------|
| [Skill-SE-Kit](https://github.com/d-wwei/skill-se-kit) | 技能学习与演化 — Agent 从浏览器交互中学习并积累可复用经验 | 内置 |
| [UDD Kit](https://github.com/d-wwei/udd-kit) | 自愈与诊断 — 检测错误、检查上游修复、在隔离 worktree 中修复问题 | 内置 |
| [UpdateKit](https://github.com/d-wwei/update-kit) | 版本检测与安全更新 — 每次 Proxy 启动时 quickCheck，支持策略、回滚、审计 | 内置 |
| [browser-control-skill](https://github.com/d-wwei/browser-control-skill) | 增强浏览器控制 — CDP Proxy、多通道路由、并行派发、站点记忆 | 可选安装 |

---

## 1. 项目结构

本仓库基于 `npm workspaces`，主要包含以下模块：

- `packages/chrome-extension`：Chrome 扩展（Side Panel UI、背景脚本、内容脚本）
- `packages/proxy-server`：本地 Proxy 服务（WebSocket + MCP bridge）
- `packages/shared`：共享协议、常量、类型定义
- `docs/mcp`：Cursor / Claude Code / VS Code Copilot 的 MCP 接入示例

---

## 2. 环境要求

- Node.js `>= 20`
- npm（建议随 Node 一起安装）
- Chrome 浏览器（支持 Side Panel 的版本）
- 至少一个 ACP Agent 可执行命令（例如）：
  - `claude-code-acp`
  - `codex-acp`
  - `gemini --experimental-acp`
  - `opencode --acp`

> 提示：扩展支持在设置页中一键检测 Agent 是否可用，并可触发自动安装。

---

## 3. 快速开始（推荐）

### 第一步：安装依赖

在仓库根目录执行：

```bash
npm install
```

### 第二步：构建 Chrome 扩展

```bash
npm run build:extension
```

构建产物位于：

- `packages/chrome-extension/dist`

### 第三步：启动本地 Proxy

```bash
npm run dev:proxy
```

默认端口：

- WebSocket：`ws://127.0.0.1:9876`
- MCP：`http://127.0.0.1:9877/mcp`

### 第四步：在 Chrome 加载扩展

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 选择「加载已解压的扩展程序」
4. 目录选 `packages/chrome-extension/dist`

### 第五步：连接并开始使用

1. 点击扩展图标打开 Side Panel
2. 打开 `Settings -> Connection`
3. 确认 `Proxy URL`（默认 `ws://localhost:9876`）
4. 首次会尝试自动获取 Token；若失败可手动粘贴
5. 在 `Agents` 中选择或新增一个 Agent（如 Codex / Claude / Gemini）
6. 回到聊天面板输入任务开始执行

---

## 4. Token 与鉴权说明

Proxy 启动后会生成/复用本地 Token，默认存放于：

- `~/.agents-in-browser/auth-token`

扩展会优先自动请求：

- `http://127.0.0.1:9876/token`

若自动获取失败，请从以下任一方式获取并手动填写：

- Proxy 启动日志中的 `Auth token`
- 本地文件 `~/.agents-in-browser/auth-token`

---

## 5. 常用命令

在仓库根目录执行：

```bash
# 构建全部模块
npm run build

# 分模块构建
npm run build:shared
npm run build:proxy
npm run build:extension

# 开发模式
npm run dev:proxy
npm run dev:extension

# 测试（当前包含扩展桥接测试）
npm test
```

---

## 6. 增强浏览器控制（可选）

安装 [browser-control-skill](https://github.com/d-wwei/browser-control-skill) 可获得进阶浏览器控制能力：

- CDP Proxy 跨平台自动化
- 多通道 Web 访问（WebSearch → WebFetch → Jina → CDP 逐级递进）
- 并行子 Agent 派发
- 站点经验记忆
- 交互元素索引
- 三层安全体系

```bash
git clone https://github.com/d-wwei/browser-control-skill ~/.agents-in-browser/skills/browser-control-skill
cd ~/.agents-in-browser/skills/browser-control-skill && npm install
```

安装后重启 Proxy 即生效。该 Skill 支持通过 [UpdateKit](https://github.com/d-wwei/update-kit) 自更新：

```bash
cd ~/.agents-in-browser/skills/browser-control-skill && npx update-kit apply
```

也可通过环境变量指定自定义路径：

```bash
BROWSER_CONTROL_SKILL_DIR=/path/to/skill npm run dev:proxy
```

---

## 7. 可选环境变量（Proxy）

启动 `packages/proxy-server` 时可配置：

- `WS_PORT`：WebSocket 端口（默认 `9876`）
- `MCP_PORT`：MCP 端口（默认 `9877`）
- `SKIP_AUTH=true`：跳过鉴权（仅开发调试使用，不建议生产/长期使用）

示例：

```bash
WS_PORT=9001 MCP_PORT=9002 npm run dev:proxy
```

---

## 8. MCP 客户端接入

本项目暴露 MCP endpoint：

- `http://127.0.0.1:9877/mcp`

可参考现成文档：

- `docs/mcp/cursor.md`
- `docs/mcp/claude-code.md`
- `docs/mcp/vscode-copilot.md`

---

## 9. 危险模式（跳过权限确认）

对于支持该功能的 Agent（`claude-code-acp`、`opencode`），可开启 `--dangerously-skip-permissions` 模式，让 Agent 自动执行所有工具调用，无需手动审批。

**两种开启方式：**

1. **Per-agent 默认**：在 `Settings → Agents` 中创建/编辑自定义 Agent，开启「默认启用 --dangerously-skip-permissions」。
2. **运行时快速切换**：点击 TopBar 上的盾牌图标（🛡）即时切换。Agent 进程会自动重启以应用新参数。

危险模式开启后，TopBar 下方会显示红色警告横幅。请谨慎使用 — Agent 将跳过所有权限确认自动执行操作。

---

## 10. 使用建议


- **先连 Proxy 再开会话**：保证扩展状态稳定，避免反复重连。
- **首次先做 Agent 预检查**：在 `Agents` 里切换时会检测命令是否存在。
- **谨慎开启自动审批**：`Permissions` 里可配置 Agent 工具自动允许，仅在可信环境使用。
- **必要时关闭自动快照**：默认会在每次提问前注入浏览器状态；如你希望更“干净”的提示词，可在 `General` 关闭 `Auto snapshot`。

---

## 11. 故障排查

### 11.1 扩展一直未连接

- 确认 `npm run dev:proxy` 正在运行
- 确认 `Proxy URL` 与端口一致
- 确认 Token 正确（或清空后让扩展自动重新获取）
- 检查 9876 / 9877 端口是否被占用

### 11.2 Agent 切换失败 / 提示未安装

- 在系统终端执行对应命令（如 `codex-acp --help`）确认可执行
- 在扩展 `Agents` 中使用安装提示命令自动安装
- 若是自定义 Agent，确认 `command`、`args`、`cwd`、`env` 设置正确

### 11.3 MCP 工具为空或无返回

- 确认 Proxy 已启动且 `http://127.0.0.1:9877/mcp` 可访问
- 确认扩展与 Proxy WebSocket 已连通
- 在 MCP 客户端先调用 `browser_tabs`/`browser_read` 做连通性验证

---

## 12. 典型工作流

1. 启动 Proxy：`npm run dev:proxy`
2. 加载扩展并打开 Side Panel
3. 选择 Agent（例如 Codex）
4. 打开目标网页并提问（如“读取页面并总结关键要点”）
5. 根据权限弹窗批准工具调用
6. 查看工具调用结果与最终回答

如果你要把该项目给团队成员使用，建议直接按本文档第 3 节作为标准上手流程。
