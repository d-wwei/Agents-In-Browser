# Browser Control Skill 优化文档

> 本文档从 `integration-plan.md` 中抽离浏览器控制相关内容，专注于 **Agent 侧的感知与推理优化**。
> 目标：让 AI Agent 更可靠、更高效地控制浏览器，减少无效 tool call，提升操作成功率。
> 本文档可以交给一个独立进程实现，不依赖 Extension 侧的 UI 改动。

---

## 1. 现状分析

### 当前架构

```
用户 prompt
    │
    ▼
agentManager.ts:186-195  ── 首次 prompt 时注入 [BROWSER CONTROL INSTRUCTIONS]
    │
    ▼
acpClient.ts  ── 发送给 Agent (Claude Code / Codex / ...)
    │
    ▼
Agent 收到 prompt + 工具列表 → 自行决定调用哪些 browser_* 工具
```

### 存在的问题

| 问题 | 现状 | 竞品做法 |
|------|------|---------|
| **无技能指导** | `AGENT_INSTRUCTIONS.md` 不存在，Agent 完全靠工具描述自行摸索 | Page-Agent 有完整的 structured output 规范 |
| **元素定位脆弱** | Agent 必须自己生成 CSS selector，极易出错 | Page-Agent 用 `[0]` `[1]` 索引，Vercel 用 `@e1` `@e2` 引用 |
| **上下文浪费** | Agent 每步都要手动调 `browser_tabs` + `browser_read`，浪费 2 轮 tool call | Page-Agent 自动注入 `getBrowserState()` |
| **截图无标注** | 纯截图，多模态 Agent 无法将视觉与元素索引关联 | Vercel Agent Browser 支持 `--annotate` 标注截图 |
| **平台限制** | `skillLoader.ts:35-37` 在 Linux 上返回 `false`，技能不注入 | 应全平台可用 |
| **无推理框架** | Agent 没有"先观察再行动"的引导，经常盲目操作 | Page-Agent 强制 EVALUATE → OBSERVE → PLAN → ACT |

---

## 2. 涉及的 Phase（从 integration-plan 中抽出）

| Phase | 内容 | 本文档职责 |
|-------|------|-----------|
| **F** | Skill Prompt Enhancement | 核心交付物 — 编写 `AGENT_INSTRUCTIONS.md` |
| **A** | Element Indexing | 定义 Agent 看到的索引格式，指导 Agent 使用索引 |
| **B** | Auto-Snapshot | 定义 `[BROWSER STATE]` 注入格式，修改 proxy 注入逻辑 |
| **E** | Annotated Screenshots | 指导 Agent 何时使用 `annotate: true` |
| **I** | Accessibility Tree | 指导 Agent 何时使用 `mode: "accessibility"` |

> Phase C/D/G/H/J 属于 Extension 侧或协议层，不在本文档范围内。

---

## 3. 前置依赖（Extension 侧需先/同步完成的改动）

本文档的实现**不阻塞于**这些依赖——技能文件可以先写好，引用未来的格式。但完整效果需要以下 Extension 改动到位：

### 3a. Element Indexing（Phase A — Extension 侧）

Extension 侧需实现 `elementIndexer.ts`，使 `browser_read` 返回格式变为：

```markdown
# Page Title

(正常 Markdown 内容...)

## Interactive Elements

[0] <button> "Submit Order"
[1] <a href="/cart"> "View Cart"
[2] <input type="text" name="search" placeholder="Search...">
[3] <select name="country"> (15 options)
[4] <textarea name="comment"> "Enter your comment..."
```

同时 `browser_click`、`browser_type`、`browser_select` 新增 `index` 参数。

### 3b. Auto-Snapshot（Phase B — Extension 侧 + Proxy 侧）

Extension 侧：新增 `browser_state_request` / `browser_state_response` 消息处理。
Proxy 侧（**本文档范围**）：`agentManager.ts` 在每次 prompt 前自动收集并注入浏览器状态。

注入格式：
```
[BROWSER STATE]
Active tab: #1234 Google Search — https://www.google.com/search?q=test
Interactive elements (top 20):
  [0] <input name="q" placeholder="Search"> value="test"
  [1] <button> "Google Search"
  [2] <a href="/advanced_search"> "Advanced"
  ...
Open tabs (3):
  #1234 Google Search — https://www.google.com/search?q=test (active)
  #1235 GitHub — https://github.com
  #1236 Docs — https://docs.example.com
[END BROWSER STATE]
```

### 3c. Annotated Screenshots（Phase E — Extension 侧）

`browser_screenshot` 新增 `annotate: true` 参数，返回截图上叠加了元素索引标签的图片。

### 3d. Accessibility Tree（Phase I — Extension 侧）

`browser_read` 新增 `mode` 参数：`"markdown"` | `"accessibility"` | `"both"`。

---

## 4. 核心交付物：AGENT_INSTRUCTIONS.md 内容规范

以下是 `packages/proxy-server/skills/browser-control-skill/AGENT_INSTRUCTIONS.md` 的完整内容设计。

### 4.1 身份与能力声明

```markdown
# Browser Control Agent

You control a real Chrome browser through browser_* tools. Every action you take
(click, type, navigate) has real effects on real web pages. Be precise and deliberate.

Available tools (13 total):

**Observation (read-only):**
- browser_tabs — list all open tabs
- browser_read — read page content as Markdown + interactive elements
- browser_screenshot — capture page screenshot (supports annotate mode)
- browser_console — read console logs
- browser_network — read network requests

**Navigation:**
- browser_navigate — go to a URL
- browser_wait — wait for element or page load
- browser_scroll — scroll the page

**Interaction (has side effects):**
- browser_click — click an element (by index, selector, or coordinates)
- browser_type — type text into a field (by index or selector)
- browser_select — select a dropdown option (by index or selector)

**Escape hatch:**
- browser_execute — run arbitrary JavaScript (use sparingly)
```

### 4.2 浏览器状态自动注入

```markdown
## Browser State

Each prompt you receive starts with a [BROWSER STATE] block containing:
- The active tab's ID, title, and URL
- A summary of interactive elements on the active page (top 20)
- A list of all open tabs

This state is auto-collected — you do NOT need to call browser_tabs or browser_read
at the start of each turn. Only call browser_read when you need:
- Full page content (the state block only has a summary)
- Content from a non-active tab
- A fresh element index after page changes
```

### 4.3 元素索引系统

```markdown
## Element Targeting — Use Indices, Not CSS Selectors

When you call browser_read, the response includes an "Interactive Elements" section:

  [0] <button> "Submit Order"
  [1] <a href="/cart"> "View Cart"
  [2] <input type="text" name="search" placeholder="Search...">

Use these numeric indices to target elements:

  ✅ browser_click(tabId: 1234, index: 0)          — click "Submit Order"
  ✅ browser_type(tabId: 1234, index: 2, text: "laptop")  — type into search
  ❌ browser_click(tabId: 1234, selector: "button.submit") — fragile, avoid

Rules:
1. Always call browser_read before your first interaction on a page
2. After navigation or major page change, call browser_read again (indices reset)
3. Use index as your PRIMARY targeting method
4. Fall back to selector ONLY for elements not in the index list (e.g., dynamically
   injected elements, elements inside iframes)
5. Fall back to (x, y) coordinates as LAST RESORT
```

### 4.4 结构化推理框架

```markdown
## Step-by-Step Reasoning

Before each action, follow this mental model:

### 1. EVALUATE
What happened after my last action? Did it succeed?
- If I navigated: did the URL change? Is the page loaded?
- If I clicked: did anything change on the page?
- If I typed: is the text visible in the field?

### 2. OBSERVE
What does the current state tell me?
- Check the [BROWSER STATE] block or call browser_read
- What interactive elements are available?
- Am I on the right page?

### 3. PLAN
What is the single next action needed to advance toward the user's goal?
- Do I need to scroll to see more elements?
- Do I need to wait for something to load?
- Which specific element should I interact with?

### 4. ACT
Execute exactly ONE action per turn.
- Use element index when possible
- Be specific about which tab (use tabId)
```

### 4.5 截图与视觉定位

```markdown
## Screenshots

Take a screenshot when:
- You just navigated to a new page and want visual context
- An action produced unexpected results
- browser_read content is unclear or incomplete (e.g., canvas-heavy pages)

Use annotated mode for visual-index correlation:
  browser_screenshot(tabId: 1234, annotate: true)
  → Returns screenshot with numbered badges [0], [1], [2] on elements
  → Badges match the indices from browser_read

Use plain mode for general state checks:
  browser_screenshot(tabId: 1234)
  → Clean screenshot without annotations
```

### 4.6 Accessibility Tree

```markdown
## Accessibility Tree Mode

For complex SPAs (React/Vue/Angular) or pages with deeply nested DOM:
  browser_read(tabId: 1234, mode: "accessibility")

Returns an ARIA-role-based tree:
  [document] "Page Title"
    [navigation] "Main Nav"
      [link] "Home" → /
      [link] "Products" → /products
    [main]
      [heading level=1] "Welcome"
      [search]
        [0] [textbox] "Search..." name=q
        [1] [button] "Search"
      [list] "Results"
        [listitem] [2] [link] "Item 1" → /item/1
        [listitem] [3] [link] "Item 2" → /item/2

Use this mode when:
- Markdown output misses interactive elements
- Page has complex ARIA patterns (dialogs, tab panels, trees)
- You need to understand the semantic structure

Use mode: "both" for richest context (returns both markdown and accessibility tree).
```

### 4.7 可靠性最佳实践

```markdown
## Best Practices

1. **Wait after navigate**: Always browser_wait after browser_navigate before reading
   or clicking. Pages need time to load and render.

2. **Scroll before clicking**: If the target element might be off-screen, use
   browser_scroll first. Off-screen elements may fail to click.

3. **Confirm async actions**: After clicking a button that triggers an async operation
   (form submit, AJAX load), use browser_wait with a selector for the expected result.

4. **Recovery strategy**: If an action fails:
   - First: take a screenshot to see what actually happened
   - Second: call browser_read to refresh element indices
   - Third: try an alternative approach (different element, different method)
   - Do NOT retry the exact same failed action more than twice

5. **One action per turn**: Execute one browser action, then observe the result.
   Don't chain multiple clicks or navigations without checking between them.

6. **Prefer specificity**: Click a specific button by index rather than using
   browser_execute to submit a form programmatically.
```

### 4.8 安全边界

```markdown
## Security Boundaries

These restrictions are enforced by the system — you cannot bypass them:
- ❌ Cannot interact with password fields (type="password")
- ❌ Cannot access chrome:// or extension pages
- ❌ Cannot execute eval() or new Function() via browser_execute
- ❌ Cannot access cross-origin iframes
- ❌ Sensitive sites (banking, auth) are blocked for interaction tools

If you encounter a security restriction, explain it to the user and suggest
a manual alternative. Do not attempt to work around security measures.
```

### 4.9 工具快速参考

```markdown
## Tool Quick Reference

# Observation
browser_tabs()                                          → list all tabs
browser_read(tabId, selector?, mode?)                   → page content + elements
browser_screenshot(tabId, fullPage?, annotate?)          → page screenshot
browser_console(tabId, limit?)                           → console logs
browser_network(tabId, limit?)                           → network requests

# Navigation
browser_navigate(tabId, url)                             → go to URL
browser_wait(tabId, selector?, timeout?, condition?)     → wait for condition
browser_scroll(tabId, direction, amount?, selector?)     → scroll page

# Interaction
browser_click(tabId, index?, selector?, x?, y?)          → click element
browser_type(tabId, index?, selector?, text, clearFirst?) → type into field
browser_select(tabId, index?, selector?, value?)          → select dropdown option

# Advanced
browser_execute(tabId, code)                              → run JavaScript
```

---

## 5. Proxy Server 侧代码变更

### 5.1 创建技能文件

**新建** `packages/proxy-server/skills/browser-control-skill/AGENT_INSTRUCTIONS.md`

将上述第 4 节的 9 个子节拼合为完整的 Markdown 文件。

### 5.2 移除平台限制

**修改** `packages/proxy-server/src/skillLoader.ts`

```typescript
// 当前代码 (line 35-37):
export function supportsDirectBrowserControl(): boolean {
  return process.platform === "darwin" || process.platform === "win32";
}

// 改为:
export function supportsDirectBrowserControl(): boolean {
  return true; // Browser control skill 应在所有平台可用
}
```

### 5.3 优化技能注入机制

**修改** `packages/proxy-server/src/agentManager.ts`

当前：仅在 `useDirectControl` 为 true 时注入。
改为：始终注入（移除 `useDirectControl` 对技能注入的门控）。

```typescript
// 当前代码 (line 186-195):
let promptText = text;
if (this.useDirectControl && !this.skillInjected.has(sessionId)) {
  const instructions = loadBrowserControlInstructions();
  // ...
}

// 改为:
let promptText = text;
if (!this.skillInjected.has(sessionId)) {
  const instructions = loadBrowserControlInstructions();
  if (instructions) {
    promptText =
      `[BROWSER CONTROL INSTRUCTIONS]\n${instructions}\n[END BROWSER CONTROL INSTRUCTIONS]\n\n${text}`;
    this.skillInjected.add(sessionId);
    console.log("[AgentManager] Injected browser control skill instructions");
  }
}
```

### 5.4 Auto-Snapshot 注入（Phase B Proxy 侧）

**修改** `packages/proxy-server/src/server.ts`

新增 `collectBrowserState()` 方法：
- 通过 WebSocket 发送 `browser_state_request` 给 Extension
- Extension Background 收集 `chrome.tabs.query({})` + active tab 的 `content_read`（轻量版，maxLength: 8000）
- 返回格式化的 `[BROWSER STATE]...[END BROWSER STATE]` 字符串
- 超时 5s，优雅降级（Extension 断开时返回空字符串）

**修改** `packages/proxy-server/src/agentManager.ts`

在 `prompt()` 方法中，技能注入之后、发送给 ACP Client 之前：

```typescript
// 收集浏览器状态（每次 prompt 都收集，不仅仅是首次）
const browserState = await this.server.collectBrowserState();
if (browserState) {
  promptText = `${browserState}\n\n${promptText}`;
}
```

**修改** `packages/shared/src/messageTypes.ts`

新增消息类型：
```typescript
interface BrowserStateRequest {
  type: "browser_state_request";
  maxElements?: number;  // 默认 20
  maxContentLength?: number;  // 默认 8000
}

interface BrowserStateResponse {
  type: "browser_state_response";
  activeTab: { id: number; url: string; title: string } | null;
  tabs: Array<{ id: number; url: string; title: string; active: boolean }>;
  interactiveElements?: Array<{ index: number; tag: string; text: string; type?: string }>;
}
```

### 5.5 工具描述增强

**修改** `packages/shared/src/browserTools.ts`

更新工具描述，让 Agent 更清晰地理解用法：

| 工具 | 当前描述 | 建议改为 |
|------|---------|---------|
| `browser_read` | "Read the DOM content..." | "Read page content as Markdown with indexed interactive elements. Use element indices [0], [1]... in subsequent click/type/select calls." |
| `browser_click` | "Click an element on the page by CSS selector or coordinates" | "Click an element. Prefer targeting by index (from browser_read). Falls back to CSS selector or (x,y) coordinates." |
| `browser_type` | "Type text into a form field identified by CSS selector" | "Type text into a form field. Prefer targeting by index (from browser_read). Falls back to CSS selector." |
| `browser_screenshot` | "Take a screenshot of a specified tab" | "Take a screenshot. Use annotate:true to overlay element index labels matching browser_read indices." |

---

## 6. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `proxy-server/skills/browser-control-skill/AGENT_INSTRUCTIONS.md` | **新建** | 第 4 节的完整内容 |
| `proxy-server/src/skillLoader.ts` | **修改** | 移除平台限制 |
| `proxy-server/src/agentManager.ts` | **修改** | 移除 `useDirectControl` 门控 + 增加 Auto-Snapshot 注入 |
| `proxy-server/src/server.ts` | **修改** | 新增 `collectBrowserState()` |
| `shared/src/messageTypes.ts` | **修改** | 新增 `BrowserStateRequest` / `BrowserStateResponse` |
| `shared/src/browserTools.ts` | **修改** | 更新 4 个工具的描述文本 |

> **不在本文档范围内的文件**（由 Extension 侧进程负责）：
> - `chrome-extension/src/content/elementIndexer.ts`（新建）
> - `chrome-extension/src/content/pageReader.ts`（修改）
> - `chrome-extension/src/content/domInteraction.ts`（修改）
> - `chrome-extension/src/content/screenshotCapture.ts`（修改）
> - `chrome-extension/src/content/accessibilityTree.ts`（新建）
> - `chrome-extension/src/background/browserTools.ts`（修改）
> - `chrome-extension/src/background/index.ts`（修改）

---

## 7. 实现顺序

```
Step 1: 创建 AGENT_INSTRUCTIONS.md + 移除平台限制
        ├── 立即可用，不依赖任何 Extension 改动
        └── Agent 获得推理框架和最佳实践指导
            │
Step 2: 工具描述增强 (browserTools.ts)
        ├── 让 Agent 从工具描述中就能理解 index 用法
        └── 向前兼容：即使 Extension 尚未实现索引，描述中的 "prefer index" 不会出错
            │
Step 3: Auto-Snapshot 注入 (server.ts + agentManager.ts + messageTypes.ts)
        ├── 依赖 Extension 侧实现 browser_state_request 处理
        └── 可先写好 proxy 侧代码，Extension 侧未就绪时 graceful fallback
```

---

## 8. 验证方法

### Step 1 验证
1. 在 Linux 上启动 proxy server → 确认日志出现 `[SkillLoader] Loaded browser control instructions`
2. 发送第一条 prompt → 确认日志出现 `[AgentManager] Injected browser control skill instructions`
3. 检查 Agent 收到的 prompt 包含 `[BROWSER CONTROL INSTRUCTIONS]` 块
4. 同一 session 的第二条 prompt → 确认不重复注入
5. Agent 应开始使用结构化推理（EVALUATE → OBSERVE → PLAN → ACT）

### Step 2 验证
1. 通过 MCP `tools/list` 查看工具描述 → 确认 `browser_read` 描述包含 "indexed interactive elements"
2. 确认 `browser_click` 描述包含 "Prefer targeting by index"

### Step 3 验证
1. 发送 prompt → 确认 prompt 前方包含 `[BROWSER STATE]` 块
2. Agent 不再在首轮调用 `browser_tabs`
3. Extension 断开时 → 确认 `[BROWSER STATE]` 优雅降级为空（不报错）

### 与 Extension 联调验证（Extension 侧完成后）
1. `browser_read` 返回 `## Interactive Elements` 段 → Agent 使用 `index` 参数调用 `browser_click`
2. `browser_screenshot(annotate: true)` 返回带标注截图 → Agent 能关联视觉与索引
3. `browser_read(mode: "accessibility")` 返回 ARIA 树 → Agent 在 SPA 页面上定位更准确

---

## 9. 与 WebMCP 路线图的关系

本文档的改动属于 **WebMCP Phase 1（Content Script 方案）** 范畴：

- AGENT_INSTRUCTIONS.md 的内容不依赖 WebMCP
- 当 WebMCP Phase 2 到来时，技能文件只需新增一段说明：
  ```markdown
  ## WebMCP Tools
  Some websites expose native tools via WebMCP (e.g., searchFlights, addToCart).
  When available, prefer WebMCP tools over browser_click/browser_type — they are
  more reliable and semantically meaningful. WebMCP tools appear in your tool list
  with a [WebMCP] prefix.
  ```
- Element indexing 和 structured reasoning 在 WebMCP 场景下仍然有用：
  Agent 需要索引来操作**不支持 WebMCP 的页面**（兜底路径）
