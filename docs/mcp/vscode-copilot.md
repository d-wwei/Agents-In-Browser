# MCP 接入：VS Code Copilot

## 1) 启动本地 proxy + MCP

```bash
npm run dev:proxy
```

默认 MCP 地址：`http://127.0.0.1:9877/mcp`

## 2) 配置 MCP server

在 VS Code Copilot 的 MCP server 配置中添加：

```json
{
  "mcpServers": {
    "acp-browser": {
      "transport": "sse",
      "url": "http://127.0.0.1:9877/mcp"
    }
  }
}
```

## 3) 验证

- 在 Copilot 里确认 `acp-browser` 在线。
- 调用 `browser_read`，确认返回内容包含网页文本。
- 调用 `resources/list`，确认有 `browser://state/active` 与 `browser://tabs`。

## 常见问题

- 如果请求报错，确认 proxy 日志里有 MCP 请求记录。
- 如返回空状态，检查 extension 是否已连接到 proxy。
