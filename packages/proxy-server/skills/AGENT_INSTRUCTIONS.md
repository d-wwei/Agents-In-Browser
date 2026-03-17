# Browser Control Skill Instructions

Use these instructions whenever you control the browser through tools.

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
- Click an indexed button:
```json
{"name":"browser_click","arguments":{"tabId":123,"index":3}}
```

- Type into an indexed input:
```json
{"name":"browser_type","arguments":{"tabId":123,"index":5,"text":"hello","clearFirst":true}}
```

- Select by indexed dropdown:
```json
{"name":"browser_select","arguments":{"tabId":123,"index":8,"value":"United States"}}
```
