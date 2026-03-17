# MCP 接入：Cursor

## 1) 启动本地 proxy + MCP

```bash
npm run dev:proxy
```

默认 MCP 地址：`http://127.0.0.1:9877/mcp`

## 2) 在 Cursor 配置 MCP server

在 Cursor 的 MCP 配置中新增：

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

## 3) 连通性验证

- 在 Cursor 中刷新 MCP servers。
- 检查是否能看到 `acp-browser` 暴露的 tools/resources/prompts。
- 首次调用建议：`browser_tabs` 或 `browser_read`。

## 常见问题

- 若连接失败，确认端口 9877 未被占用。
- 若 tools 为空，先确认 extension 与 proxy WebSocket 已连通。
