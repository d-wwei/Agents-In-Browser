# Agents In Browser 使用说明

[English](./README.md)

![Agents In Browser](./assets/readme-cover-transparent.png)

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

## 6. 可选环境变量（Proxy）

启动 `packages/proxy-server` 时可配置：

- `WS_PORT`：WebSocket 端口（默认 `9876`）
- `MCP_PORT`：MCP 端口（默认 `9877`）
- `SKIP_AUTH=true`：跳过鉴权（仅开发调试使用，不建议生产/长期使用）

示例：

```bash
WS_PORT=9001 MCP_PORT=9002 npm run dev:proxy
```

---

## 7. MCP 客户端接入

本项目暴露 MCP endpoint：

- `http://127.0.0.1:9877/mcp`

可参考现成文档：

- `docs/mcp/cursor.md`
- `docs/mcp/claude-code.md`
- `docs/mcp/vscode-copilot.md`

---

## 8. 使用建议

- **先连 Proxy 再开会话**：保证扩展状态稳定，避免反复重连。
- **首次先做 Agent 预检查**：在 `Agents` 里切换时会检测命令是否存在。
- **谨慎开启自动审批**：`Permissions` 里可配置 Agent 工具自动允许，仅在可信环境使用。
- **必要时关闭自动快照**：默认会在每次提问前注入浏览器状态；如你希望更“干净”的提示词，可在 `General` 关闭 `Auto snapshot`。

---

## 9. 故障排查

### 9.1 扩展一直未连接

- 确认 `npm run dev:proxy` 正在运行
- 确认 `Proxy URL` 与端口一致
- 确认 Token 正确（或清空后让扩展自动重新获取）
- 检查 9876 / 9877 端口是否被占用

### 9.2 Agent 切换失败 / 提示未安装

- 在系统终端执行对应命令（如 `codex-acp --help`）确认可执行
- 在扩展 `Agents` 中使用安装提示命令自动安装
- 若是自定义 Agent，确认 `command`、`args`、`cwd`、`env` 设置正确

### 9.3 MCP 工具为空或无返回

- 确认 Proxy 已启动且 `http://127.0.0.1:9877/mcp` 可访问
- 确认扩展与 Proxy WebSocket 已连通
- 在 MCP 客户端先调用 `browser_tabs`/`browser_read` 做连通性验证

---

## 10. 典型工作流

1. 启动 Proxy：`npm run dev:proxy`
2. 加载扩展并打开 Side Panel
3. 选择 Agent（例如 Codex）
4. 打开目标网页并提问（如“读取页面并总结关键要点”）
5. 根据权限弹窗批准工具调用
6. 查看工具调用结果与最终回答

如果你要把该项目给团队成员使用，建议直接按本文档第 3 节作为标准上手流程。
