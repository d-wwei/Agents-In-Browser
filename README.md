# Agents In Browser

[中文](./README.zh-CN.md)

![Agents In Browser](./assets/readme-cover.png)

Agents In Browser is a local-first system (`Chrome extension + local proxy + ACP agent`) that lets AI coding agents interact with your browser safely from a side panel.

## Why We Built This

Most AI browser extensions are strong at page-only assistance, but become limited when tasks need both browser context and local execution. Agents In Browser is built to bridge that gap:

- unify browser actions and local agent execution in one loop
- let agents continue from webpage context to local code/files/terminal workflows
- keep control in your local runtime instead of a fixed hosted plugin pipeline

## What Makes It Different

The most important difference is **bridging local agents**.

- **Browser + local environment integration**: one task can span webpage actions and local dev operations.
- **Flexible LLM token sources**: since this system bridges local agents (Claude Code/Codex/Gemini/custom ACP agents), you can choose your preferred model/token source strategy instead of being locked to one plugin backend.
- **Agent/runtime flexibility**: you can switch agent commands and runtime settings locally.
- **Control and privacy**: sensitive context can remain in your local environment and workflow.

## Project Layout

- `packages/chrome-extension`: Chrome Side Panel extension (UI + background + content scripts)
- `packages/proxy-server`: local proxy service (WebSocket + MCP bridge/direct control)
- `packages/shared`: shared protocol/types/constants

## Requirements

- Node.js `>= 20`
- npm
- Chrome browser
- At least one ACP-capable agent command, for example:
  - `claude-code-acp`
  - `codex-acp`
  - `gemini --experimental-acp`
  - `opencode --acp`

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build extension:

   ```bash
   npm run build:extension
   ```

3. Start proxy:

   ```bash
   npm run dev:proxy
   ```

4. Load extension in Chrome:
   - Open `chrome://extensions`
   - Enable Developer Mode
   - Click "Load unpacked"
   - Select `packages/chrome-extension/dist`

5. Open Side Panel and connect:
   - Go to `Settings -> Connection`
   - Default WS URL: `ws://localhost:9876`
   - Token is auto-fetched when possible; otherwise paste it manually

## Default Ports

- WebSocket: `ws://127.0.0.1:9876`
- MCP endpoint: `http://127.0.0.1:9877/mcp`

## Token & Auth

- Token file: `~/.agents-in-browser/auth-token`
- Auto-fetch endpoint: `http://127.0.0.1:9876/token`

If auto-fetch fails, copy the token from proxy logs or from the local token file.

## Commands

```bash
# build all workspaces
npm run build

# build each package
npm run build:shared
npm run build:proxy
npm run build:extension

# development
npm run dev:proxy
npm run dev:extension

# tests
npm test
```

## Proxy Environment Variables

- `WS_PORT` (default `9876`)
- `MCP_PORT` (default `9877`)
- `SKIP_AUTH=true` (development only)

Example:

```bash
WS_PORT=9001 MCP_PORT=9002 npm run dev:proxy
```

## Troubleshooting

- Extension cannot connect:
  - Ensure proxy is running
  - Check WS URL and token
  - Ensure port `9876` is free
- MCP tools unavailable:
  - Ensure `http://127.0.0.1:9877/mcp` is reachable
  - Ensure extension is connected to proxy

## Dangerous Mode (Skip Permissions)

For agents that support it (`claude-code-acp`, `opencode`), you can enable `--dangerously-skip-permissions` mode to let the agent execute all tool calls without manual approval.

**Two ways to enable:**

1. **Per-agent default**: In `Settings → Agents`, create/edit a custom agent and toggle "Enable --dangerously-skip-permissions by default".
2. **Runtime toggle**: Click the shield icon (🛡) on the TopBar to toggle the mode on/off. The agent process will restart with the new flag.

When dangerous mode is active, a red warning banner appears below the TopBar. Use with caution — the agent will auto-execute all operations without confirmation.

## Typical Workflow

1. Run `npm run dev:proxy`
2. Load/open extension side panel
3. Select an agent
4. Ask the agent to read or act on the current page
5. Approve tool calls when prompted
