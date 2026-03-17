# MCP 接入：Claude Code

## 1) 启动本地 proxy + MCP

```bash
npm run dev:proxy
```

默认 MCP 地址：`http://127.0.0.1:9877/mcp`

## 2) 在 Claude Code MCP 配置中添加 server

示例（按你本地 Claude Code 配置文件结构调整）：

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

- 启动 Claude Code 后确认 MCP server 已加载。
- 验证 `tools/list` 可看到浏览器工具。
- 试运行：`browser_tabs`。

## 常见问题

- 若出现连接超时，先用浏览器访问 `http://127.0.0.1:9877/mcp` 确认 SSE 端点可达。
- 若 tool 调用无返回，检查 extension sidepanel 是否在线。
