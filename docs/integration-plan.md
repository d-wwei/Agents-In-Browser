# Plan: Integrate Competitive Insights into Agents-In-Browser

## Context

After analyzing Page-Agent (Alibaba), AIPex, Nanobrowser, Vercel Agent Browser, Dev Browser, and Every Code, we identified 10 improvements to integrate into Agents-In-Browser. These improvements address the biggest gaps vs. competitors: unreliable element targeting (CSS selectors), excessive tool call round-trips, lack of visual feedback, and no MCP standard compatibility. The plan aligns with the existing WebMCP phased roadmap.

---

## Phase A: Element Indexing + Enhanced browser_read (P0, Size: L)

**Problem**: Agents must generate CSS selectors to target elements — fragile, verbose, error-prone. Competitors (Page-Agent, Vercel Agent Browser) use numeric indices `[0]`, `[1]` or refs `@e1`, `@e2`.

### Changes

#### A1. New file: `packages/chrome-extension/src/content/elementIndexer.ts`
- **`buildInteractiveElementMap()`**: Walks DOM, finds all interactive elements (links, buttons, inputs, selects, textareas, [role="button"], [onclick], contenteditable, [tabindex])
- Filters: visible only, not inside `<script>/<style>`, not `aria-hidden="true"`
- Assigns sequential index `[0]`, `[1]`, ... to each element
- Returns `Map<number, Element>` stored as module-level `currentElementMap`
- Returns serialized list: `{ index, tag, role, text, type?, name?, placeholder?, href?, ariaLabel?, boundingBox }`
- **`getElementByIndex(index: number)`**: Lookup from `currentElementMap`, throws if stale/not found
- **`clearElementMap()`**: Reset map (call on navigation / DOM major change)

#### A2. Modify: `packages/chrome-extension/src/content/pageReader.ts`
- Add `includeInteractiveElements` option to `ReaderOptions`
- When enabled, call `buildInteractiveElementMap()` after markdown conversion
- Append interactive elements section to markdown output:
  ```
  ## Interactive Elements
  [0] <button> "Submit Order"
  [1] <a href="/cart"> "View Cart"
  [2] <input type="text" name="search" placeholder="Search...">
  [3] <select name="country"> (15 options)
  ```
- Return `{ markdown, title, url, interactiveElements }` (backward-compatible, new field optional)

#### A3. Modify: `packages/chrome-extension/src/content/domInteraction.ts`
- Add `index` parameter to `click()`, `type()`, `select()` functions
- Resolution priority: `index` > `selector` > `(x, y)` coordinates
- `index` uses `getElementByIndex()` from elementIndexer
- Existing selector/coordinate paths unchanged (backward compatible)

#### A4. Modify: `packages/chrome-extension/src/content/index.ts`
- `content_read_request` handler: pass `includeInteractiveElements: true` to pageReader
- `content_click_request` / `content_type_request` / `content_select_request`: accept `index` param, forward to domInteraction
- New message: `content_refresh_elements` — rebuilds element map without full page read

#### A5. Modify: `packages/shared/src/browserTools.ts`
- `browser_read`: Add `includeInteractiveElements` boolean param (default: true)
- `browser_click`: Add `index` param: `{ type: "number", description: "Element index from browser_read interactive elements list" }`
- `browser_type`: Add `index` param (alternative to selector)
- `browser_select`: Add `index` param (alternative to selector)
- Update descriptions to mention index-based targeting

#### A6. Modify: `packages/chrome-extension/src/background/browserTools.ts`
- `handleBrowserRead`: Pass `includeInteractiveElements` arg to content script
- `handleBrowserClick/Type/Select`: Forward `index` param to content script messages

---

## Phase B: Browser State Auto-Snapshot (P0, Size: M)

**Problem**: Agent must call `browser_tabs` + `browser_read` manually each step, wasting round-trips. Page-Agent auto-injects state before each step.

### Changes

#### B1. Modify: `packages/proxy-server/src/server.ts`
- New method: `collectBrowserState()` — sends `browser_state_request` via WebSocket to extension, awaits response
- Returns: `{ activeTab: { id, url, title }, tabs: [...], interactiveElements?: [...] }`
- Timeout: 5s, graceful fallback (empty state if extension disconnected)

#### B2. Modify: `packages/chrome-extension/src/background/index.ts`
- Handle new `browser_state_request` message from proxy
- Collect: `chrome.tabs.query({})` + active tab's content_read (lightweight, maxLength: 8000)
- Return as `browser_state_response`

#### B3. Modify: `packages/shared/src/messageTypes.ts`
- Add `browser_state_request` and `browser_state_response` message types

#### B4. Modify: `packages/proxy-server/src/agentManager.ts`
- In `prompt()`: before sending to ACP client, call `server.collectBrowserState()`
- Prepend state to prompt text:
  ```
  [BROWSER STATE]
  Active tab: [id] title — url
  Interactive elements: [0] button "Submit" [1] input "Search" ...
  Open tabs: (3 tabs) ...
  [END BROWSER STATE]

  <user's actual prompt>
  ```
- Add setting `autoSnapshot: boolean` (default: true), controllable from extension settings

---

## Phase C: Visual Overlay & Element Highlighting (P1, Size: M)

**Problem**: No visual feedback when agent operates on page. Users can't see what's happening.

### Changes

#### C1. New file: `packages/chrome-extension/src/content/agentOverlay.ts`
- **`showAgentOverlay()`**: Creates shadow DOM container with:
  - Floating status badge (top-right): "Agent active" with pulsing dot
  - Semi-transparent page overlay (pointer-events: none) during operations
- **`hideAgentOverlay()`**: Removes overlay
- **`highlightElement(element, label?, duration?)`**: Draw highlight box around element with optional index label
  - Reuse existing `highlightElement()` logic from `screenshotCapture.ts` but enhanced:
    - Add label overlay (e.g., "[3]" badge)
    - Support configurable colors (blue for reading, green for clicking, orange for typing)
    - Auto-remove after duration (default 2s)
- **`showActionFeedback(action, target)`**: Brief toast-style indicator ("Clicking [3] Submit button")

#### C2. Modify: `packages/chrome-extension/src/content/index.ts`
- Import agentOverlay
- Before executing any tool action (click/type/scroll/select): call `highlightElement()` on the target
- After action: brief success/error flash

#### C3. Modify: `packages/chrome-extension/src/content/screenshotCapture.ts`
- Export `highlightElement()` so it can be reused, or move shared logic to agentOverlay

---

## Phase D: Content Script Heartbeat & Agent State Sync (P1, Size: S)

**Problem**: Content script doesn't know if agent is active. Can't show/hide overlay or clean up resources.

### Changes

#### D1. Modify: `packages/chrome-extension/src/background/index.ts`
- When agent connects/disconnects: write to `chrome.storage.local`:
  ```
  { agentActive: boolean, activeTabId: number | null, lastHeartbeat: timestamp }
  ```
- Update on every tool call and agent state change

#### D2. Modify: `packages/chrome-extension/src/content/index.ts`
- Add `chrome.storage.onChanged` listener for `agentActive` / `activeTabId`
- When agent becomes active on this tab: `showAgentOverlay()`
- When agent disconnects or switches tab: `hideAgentOverlay()`, `clearElementMap()`

---

## Phase E: Annotated Screenshots (P1, Size: M)

**Problem**: Screenshots are plain images. Multimodal agents can't correlate visual elements with indices.

### Changes

#### E1. Modify: `packages/chrome-extension/src/content/screenshotCapture.ts`
- New exported function: `annotateInteractiveElements()`:
  - For each element in `currentElementMap`, draw a numbered label badge at element's top-left corner
  - Uses Canvas overlay or injected DOM elements (removed after capture)
  - Badge style: small colored circle with white number text
- New exported function: `captureAnnotatedScreenshot()`:
  - Call `annotateInteractiveElements()` → capture → remove annotations
  - Returns base64 PNG with labels baked in

#### E2. Modify: `packages/chrome-extension/src/background/browserTools.ts`
- `handleBrowserScreenshot`: Add `annotate` boolean param
- When `annotate: true`: use content script to annotate before capture
- Default: `false` (backward compatible)

#### E3. Modify: `packages/shared/src/browserTools.ts`
- `browser_screenshot`: Add `annotate` param to inputSchema

---

## Phase F: Structured Skill Prompt Enhancement (P1, Size: S)

**Problem**: No AGENT_INSTRUCTIONS.md exists yet. Agent lacks guidance on using element indices, evaluating results, and structured reasoning.

### Changes

#### F1. New file: `packages/proxy-server/skills/browser-control-skill/AGENT_INSTRUCTIONS.md`
Content should include:
- Element index usage guide: "Use `[index]` from browser_read interactive elements instead of CSS selectors"
- Structured reasoning template:
  ```
  1. EVALUATE: What happened after the last action? Did it succeed?
  2. OBSERVE: What is the current browser state? What elements are available?
  3. PLAN: What should I do next to achieve the user's goal?
  4. ACT: Execute the specific action with element index
  ```
- Browser state auto-snapshot explanation: "Each prompt includes current browser state — you don't need to call browser_tabs or browser_read for basic context"
- Best practices: scroll before interacting with off-screen elements, wait after navigation, prefer index over selector
- Tool usage examples with index-based targeting

---

## Phase G: MCP Standard Compatibility (P1, Size: L)

**Problem**: Only ACP protocol supported. AIPex shows any MCP-compatible agent (Cursor, Copilot, etc.) can connect if MCP is the interface. Aligns with existing WebMCP Phase 2 roadmap.

### Changes

#### G1. Modify: `packages/proxy-server/src/mcpBridge.ts`
- Upgrade to full MCP server spec (currently minimal):
  - Support `notifications/initialized` from client
  - Support `resources/list` and `resources/read` for browser state as MCP resources
  - Expose ALL 13 tools (not just P0 7) via `tools/list`
  - Add `prompts/list` for browser-control skill prompt as MCP prompt
- This makes the existing HTTP MCP server usable by any MCP client, not just our ACP agents

#### G2. Modify: `packages/proxy-server/src/skillLoader.ts`
- Remove platform restriction (`supportsDirectBrowserControl` always returns true after MCP upgrade)
- Or: keep dual mode but make MCP the default for all platforms

#### G3. Modify: `packages/shared/src/constants.ts`
- Add MCP server metadata constants (name, version, capabilities)

#### G4. Documentation
- Add MCP connection instructions for Cursor, Claude Code, VS Code Copilot
- Format: `npx` one-liner or config snippet for each client

---

## Phase H: Main World Script (P2, Size: S)

### Changes

#### H1. New file: `packages/chrome-extension/src/content/mainWorld.ts`
- Injected via `chrome.scripting.executeScript({ world: "MAIN" })`
- Exposes `window.AGENTS_IN_BROWSER`:
  ```typescript
  {
    version: string,
    available: boolean,
    execute(task: string): Promise<{ status, result }>,
    stop(): void,
    onStatus(callback): void
  }
  ```
- Communicates with content script via `window.postMessage`
- Content script relays to background → proxy → agent

#### H2. Modify: `packages/chrome-extension/src/background/browserTools.ts`
- Register main world script injection on tab activation (when agent is active)

---

## Phase I: Accessibility Tree (P2, Size: M)

### Changes

#### I1. New file: `packages/chrome-extension/src/content/accessibilityTree.ts`
- **`buildAccessibilityTree(root?)`**: Walk DOM and build tree using:
  - `element.getAttribute('role')`, `aria-label`, `aria-describedby`, `aria-expanded`, `aria-checked`, etc.
  - Semantic HTML mapping: `<button>` → role=button, `<nav>` → role=navigation, etc.
  - Output format: indented text tree similar to Chrome DevTools accessibility panel
- Integrate with elementIndexer: indices appear in both markdown and accessibility tree

#### I2. Modify: `packages/shared/src/browserTools.ts`
- `browser_read`: Add `mode` param: `"markdown" | "accessibility" | "both"` (default: "markdown")

---

## Phase J: Task History with Replay (P2, Size: M)

### Changes

#### J1. Modify: `packages/chrome-extension/src/sidepanel/store/chatStore.ts`
- Extend IndexedDB schema (v2 migration):
  - New object store: `taskSteps` — `{ id, sessionId, stepIndex, action, args, result, screenshot?, timestamp }`
- On each tool_call + tool_result pair: persist as a task step
- Optional: capture mini-screenshot after each action

#### J2. New component: `packages/chrome-extension/src/sidepanel/components/TaskHistory/`
- `TaskHistoryPanel.tsx`: List of past task sessions with step counts
- `TaskStepList.tsx`: Step-by-step view of a task (action → result → screenshot)
- Accessible from session list or a new "History" tab in sidepanel

---

## Implementation Order

```
Phase A (Element Indexing)  ─────────┐
                                     ├─→ Phase B (Auto-Snapshot) ─→ Phase F (Skill Prompt)
Phase D (Heartbeat)  ───→ Phase C (Visual Overlay)
                                     │
Phase A ─────────────────────────────├─→ Phase E (Annotated Screenshots)
                                     │
                                     └─→ Phase G (MCP Compat)

Phase H (Main World) ── independent
Phase I (A11y Tree)  ── depends on Phase A
Phase J (Task History) ── depends on Phase A (for step tracking)
```

**Recommended sprint order:**
1. **Sprint 1**: Phase A (Element Indexing) + Phase D (Heartbeat) — foundation for everything else
2. **Sprint 2**: Phase B (Auto-Snapshot) + Phase F (Skill Prompt) + Phase C (Visual Overlay)
3. **Sprint 3**: Phase E (Annotated Screenshots) + Phase G (MCP Compat)
4. **Sprint 4**: Phase H (Main World) + Phase I (A11y Tree) + Phase J (Task History)

---

## Critical Files Summary

| File | Phases |
|------|--------|
| `chrome-extension/src/content/elementIndexer.ts` | **NEW** — A |
| `chrome-extension/src/content/agentOverlay.ts` | **NEW** — C |
| `chrome-extension/src/content/mainWorld.ts` | **NEW** — H |
| `chrome-extension/src/content/accessibilityTree.ts` | **NEW** — I |
| `chrome-extension/src/content/pageReader.ts` | A |
| `chrome-extension/src/content/domInteraction.ts` | A |
| `chrome-extension/src/content/index.ts` | A, C, D |
| `chrome-extension/src/content/screenshotCapture.ts` | C, E |
| `chrome-extension/src/background/browserTools.ts` | A, B, E, H |
| `chrome-extension/src/background/index.ts` | B, D |
| `chrome-extension/src/sidepanel/store/chatStore.ts` | J |
| `chrome-extension/src/sidepanel/store/settingsStore.ts` | B (autoSnapshot setting) |
| `shared/src/browserTools.ts` | A, E, I |
| `shared/src/messageTypes.ts` | B |
| `shared/src/constants.ts` | G |
| `proxy-server/src/server.ts` | B |
| `proxy-server/src/agentManager.ts` | B |
| `proxy-server/src/mcpBridge.ts` | G |
| `proxy-server/src/skillLoader.ts` | G |
| `proxy-server/skills/browser-control-skill/AGENT_INSTRUCTIONS.md` | **NEW** — F |

---

## Verification

### Phase A (Element Indexing)
1. Load any web page, call `browser_read` → verify interactive elements section appears with `[0]`, `[1]`, etc.
2. Call `browser_click` with `index: 0` → verify correct element clicked
3. Call `browser_type` with `index: N` targeting an input → verify text entered
4. Navigate to new page → verify element map refreshes

### Phase B (Auto-Snapshot)
1. Send a prompt via sidepanel → check proxy logs for browser state prepended to prompt
2. Verify agent receives state without calling `browser_tabs`/`browser_read` manually

### Phase C (Visual Overlay)
1. Agent starts → verify floating "Agent active" badge appears on page
2. Agent clicks element → verify highlight flash on target element
3. Agent disconnects → verify overlay disappears

### Phase E (Annotated Screenshots)
1. Call `browser_screenshot` with `annotate: true` → verify numbered labels on interactive elements in the image

### Phase F (Skill Prompt)
1. Start agent session → verify AGENT_INSTRUCTIONS.md content appears in first prompt
2. Agent should use `[index]` references in tool calls instead of CSS selectors

### Phase G (MCP)
1. Configure Claude Code / Cursor to connect to `http://localhost:9877/mcp` as MCP server
2. Verify `tools/list` returns all 13 tools
3. Execute tool calls and verify results

### General
- All existing tests pass (if any)
- Existing CSS selector-based tool calls still work (backward compatible)
- Extension builds without errors: `cd packages/chrome-extension && npm run build`
- Proxy server starts without errors: `cd packages/proxy-server && npx tsx src/index.ts`

---

## Alignment with WebMCP Phased Roadmap

This plan is designed to coexist with the existing 3-phase WebMCP evolution strategy:

### Current Plan ↔ WebMCP Phase 1 (Now)
- **No conflict.** All Phases A–J work with the existing Content Script architecture (Phase 1 of WebMCP roadmap)
- Element indexing, auto-snapshot, visual overlay all operate through content scripts — the same channel WebMCP Phase 1 relies on
- Phase G (MCP Compat) **strengthens** WebMCP Phase 2 readiness by making the proxy server a proper MCP server now

### Preparing for WebMCP Phase 2 (Chrome Stable supports WebMCP)
- Phase G's MCP bridge upgrade creates the **tool routing infrastructure** needed for Phase 2
- When WebMCP arrives, the `mcpBridge.ts` `tools/call` handler gains a third path:

  ```
  routeToolCall(tool, args):
    1. Is it a WebMCP tool from navigator.modelContext?  → executeWebMCPTool()   [Phase 2 NEW]
    2. Is it an index-based browser tool?                → executeBuiltinTool()   [Phase A]
    3. Fallback to CSS selector path                     → executeBuiltinTool()   [Phase 1 existing]
  ```

- Element indexing (Phase A) and annotated screenshots (Phase E) remain relevant even WITH WebMCP — they help agents understand pages that don't expose WebMCP tools
- The skill prompt (Phase F) can be extended to teach agents: "If this page exposes WebMCP tools, prefer those over browser_click/browser_type"

### WebMCP Phase 3 (WebMCP widespread)
- Content Script tools (Phase A element indexing, Phase C overlay) become the **fallback layer** for non-WebMCP sites
- Phase H (Main World Script) becomes less needed as WebMCP provides the standard page↔agent interface
- Phase I (Accessibility Tree) supplements WebMCP for sites that expose tools but lack good semantic structure

### Key Design Decisions for WebMCP Compatibility
1. **Element indices are ephemeral** — they don't conflict with WebMCP tool schemas
2. **Auto-snapshot (Phase B) is transport-agnostic** — it collects state regardless of whether tools use Content Script or WebMCP
3. **MCP bridge (Phase G) is additive** — adding WebMCP tool discovery later is a new `onWebMCPToolsDiscovered()` handler, not a rewrite
4. **No WebMCP code is written now** — per Phase 1 principle "不实现 WebMCP 相关代码"
