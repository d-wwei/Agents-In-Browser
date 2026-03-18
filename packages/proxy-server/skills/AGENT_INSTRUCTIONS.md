# Browser Control Skill Instructions (MCP Mode)

Use these instructions whenever you control the browser through MCP browser tools.

---

## 1) Prefer index-based targeting
- Always prefer interactive element indices from `browser_read` output.
- Use `[index]` instead of generating CSS selectors when possible.
- Fallback order: `index` → `selector` → coordinates.

## 2) Structured loop for each step
1. **EVALUATE**: What happened after the previous action? Success/failure?
2. **OBSERVE**: Read current browser state and available interactive elements.
3. **PLAN**: Decide the smallest next action to make progress.
4. **ACT**: Call one precise browser tool (prefer index arguments).

## 3) Auto-snapshot behavior
- Each user prompt may already include `[BROWSER STATE]`.
- If that state is sufficient, do not call `browser_tabs`/`browser_read` redundantly.
- Call `browser_read` again after meaningful navigation or when indices become stale.

## 4) Best practices
- Scroll before interacting with off-screen elements.
- Wait briefly after navigation before next action.
- Prefer exact, single-step tool calls and then verify outcomes.
- Keep retries bounded; if an index fails, refresh elements and retry once.

## 5) Examples

Click an indexed button:
```json
{"name":"browser_click","arguments":{"tabId":123,"index":3}}
```

Type into an indexed input:
```json
{"name":"browser_type","arguments":{"tabId":123,"index":5,"text":"hello","clearFirst":true}}
```

Select by indexed dropdown:
```json
{"name":"browser_select","arguments":{"tabId":123,"index":8,"value":"United States"}}
```

---

## 6) Recovery Strategy

When a browser action fails or produces unexpected results, follow this escalation procedure:

1. **Observe current state**: Call `browser_read` or `browser_screenshot` to see what the page looks like now. Do not guess — always confirm the current state.
2. **Re-acquire element indices**: After any navigation, modal dismissal, or page mutation, element indices become stale. Call `browser_read` again to get fresh indices.
3. **Try alternative targeting**: If index-based targeting fails, try in this order:
   - A different index (the target may have shifted)
   - CSS selector via `browser_execute` (e.g., `document.querySelector("#btn").click()`)
   - Coordinate-based click via `browser_execute` (e.g., `document.elementFromPoint(x,y).click()`)
4. **Check for overlays**: Popups, modals, cookie consent banners, GDPR dialogs, or login prompts may be blocking the target element. Look for dismiss/close buttons in the interactive elements list and click them first.
5. **Two-strike rule**: Do NOT retry the exact same failed action more than twice. After two failures with the same approach, you MUST switch strategy (different selector, scroll into view, dismiss overlay, etc.).

## 7) Lazy Loading & Infinite Scroll Pages

Many modern pages load content on demand as you scroll. To read such pages completely:

1. **Scroll one viewport at a time**: Use `browser_scroll` with direction `"down"`. Do not jump to the bottom.
2. **Wait after each scroll**: Wait 1–2 seconds to let new content render before reading.
3. **Read incrementally**: After each scroll + wait cycle, call `browser_read` to capture newly loaded content. Accumulate results across reads.
4. **Detect scroll end**: If two consecutive reads return identical content, you have likely reached the bottom.
5. **Prefer real scrolling**: Always scroll the actual page rather than trying alternative extraction methods. Real scrolling triggers the lazy-load mechanisms that populate the DOM.

Example workflow for reading an infinite-scroll page:
```
1. browser_read(tabId)              → capture initial content
2. browser_scroll(tabId, "down")    → scroll one viewport
3. (wait 1.5s)
4. browser_read(tabId)              → capture new content
5. Repeat steps 2–4 until content stops changing
```

For virtual-scrolling pages (React Virtualized, Twitter/X, etc.) where DOM nodes are destroyed on scroll-out, you can inject a cumulative crawler script via `browser_execute`:

```json
{"name":"browser_execute","arguments":{"tabId":123,"expression":"window.__collectedText = window.__collectedText || ''; var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false); var node; while(node = walker.nextNode()) { var block = node.parentElement; if(block && !window.__collectedText.includes(block.innerText.substring(0,80))) { window.__collectedText += block.innerText + '\\n'; } } window.__collectedText.length + ' chars collected'"}}
```

Call this after each scroll to accumulate text, then retrieve the full result:
```json
{"name":"browser_execute","arguments":{"tabId":123,"expression":"window.__collectedText"}}
```

---

## 8) Safety Boundaries

The browser extension enforces safety restrictions at the code level. Knowing these boundaries helps you avoid wasted tool calls.

### Blocked Sites

The following site categories are **automatically blocked** — any `browser_click`, `browser_type`, or `browser_execute` call targeting these domains will be rejected:

| Category | Domains |
|---|---|
| **Banking** | chase, wellsfargo, bankofamerica, citi, capitalone, usbank, pnc, tdbank, hsbc, and any domain containing `.bank` |
| **Payments** | paypal, venmo, stripe, square, wise, revolut, robinhood, coinbase, binance |
| **Identity & Auth** | accounts.google.com, login.microsoftonline.com, login.live.com, icloud.com/account, *.okta.com, *.auth0.com, *.onelogin.com |
| **Cloud Admin** | console.aws.amazon.com, console.cloud.google.com, portal.azure.com |
| **Chrome Internal** | chrome://, chrome-extension://, about: pages |

**Before calling any tool, check the current URL.** If it matches any of the above, do not attempt the action — inform the user why it is blocked.

### Blocked Elements

Even on allowed sites, certain elements are protected:

- **Password fields**: `input[type="password"]`, `input[name*="password"]`, `input[autocomplete="current-password"]`, `input[autocomplete="new-password"]` — will be blocked from `browser_type` / `browser_click`.
- **Payment buttons**: Any button whose text matches "pay", "purchase", "buy", "checkout", "place order", "confirm payment", "subscribe", "upgrade", "donate" (including Chinese: 付款, 支付, 购买, 下单, 确认订单, 立即购买) — will be blocked from `browser_click`.

### Best Practices for Sensitive Operations

- Always **confirm with the user** before extracting data that could be sensitive (personal info, financial data, credentials).
- Do not attempt to access `chrome://` internal pages.
- Cross-origin iframe content is **not accessible** — only elements in the top-level document can be targeted.

---

## 9) Workflow Example: Accessing an Authenticated Page

A complete step-by-step example for reading content from a page that requires login:

```
Step 1: List open tabs
  → browser_tabs()
  → Find the target tab, or identify that the user needs to navigate there

Step 2: Navigate (if needed)
  → browser_navigate(tabId, "https://internal.company.com/dashboard")

Step 3: Wait for page load
  → (wait 2 seconds)

Step 4: Observe current state
  → browser_read(tabId)
  → Check: Am I on a login page or the target page?

Step 5a: If on login page
  → Tell the user: "Please log in manually in Chrome, then let me know when you're ready."
  → (User logs in and confirms)
  → browser_read(tabId) again to verify

Step 5b: If on target page with overlay/modal
  → Find dismiss button in interactive elements list
  → browser_click(tabId, dismissButtonIndex)
  → browser_read(tabId) again

Step 6: Extract content
  → browser_read(tabId)
  → If content is long/truncated, use scroll + read loop (see Section 7)

Step 7: Return results to user
  → Summarize or present the extracted content
```
