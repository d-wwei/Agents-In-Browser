# Chrome Extension E2E 手测清单（Main World Bridge）

> 目标：验证 `window.AGENTS_IN_BROWSER` 在 active agent tab 场景下可用、受控、稳定。

## 环境准备

1. 构建扩展：`npm run build --workspace=@anthropic-ai/acp-browser-extension`
2. 在 Chrome `chrome://extensions` 打开开发者模式，加载 `packages/chrome-extension/dist`
3. 打开 sidepanel，并确保可触发 agent/browser tool 调用

## 用例清单

### 1) Active tab 注入成功
- 步骤：
  1. 打开普通网页 Tab A
  2. 在 sidepanel 触发一次 browser tool（使 agentActive=true 且 activeTabId=Tab A）
  3. 在 Tab A console 执行：`typeof window.AGENTS_IN_BROWSER`
- 预期：返回 `"object"`

### 2) 非 active agent tab 不允许执行
- 步骤：
  1. 保持 Tab A 为 active agent tab
  2. 切到 Tab B（普通网页）
  3. 在 Tab B console 执行：
     `await window.AGENTS_IN_BROWSER?.execute("return 1")`
- 预期：抛出错误，包含 `Agent is not active for this tab`

### 3) MAIN world execute 可返回结果
- 步骤：
  1. 回到 Tab A
  2. 在 Tab A console 执行：
     `await window.AGENTS_IN_BROWSER.execute("return {ok:true,value:42}")`
- 预期：返回 `{ ok: true, value: 42 }`

### 4) stop 可关闭 agent 状态
- 步骤：
  1. 在 Tab A console 执行：`await window.AGENTS_IN_BROWSER.stop()`
  2. 再执行：`await window.AGENTS_IN_BROWSER.status()`
- 预期：
  - stop 返回 `{ stopped: true }`
  - status 返回 `agentActive=false`

### 5) 页面导航后自动补注入
- 步骤：
  1. 重新触发 agent 激活到 Tab A
  2. Tab A 刷新页面（或导航到同站新 URL）
  3. 页面加载完成后执行：`typeof window.AGENTS_IN_BROWSER`
- 预期：仍为 `"object"`（onUpdated complete 后已补注入）

### 6) 超时保护生效
- 步骤：
  1. 人为让 background 无响应（可临时断点/禁用 service worker 响应）
  2. 调用 `window.AGENTS_IN_BROWSER.execute(...)`
- 预期：约 10s 内抛出超时错误（`timed out`）

## 回归建议
- 在以下站点各抽测 1 次：
  - 常规静态页面
  - SPA 页面（history/pushState 导航）
  - 含 iframe 的复杂页面
