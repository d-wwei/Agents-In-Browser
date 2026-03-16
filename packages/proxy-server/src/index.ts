import { ProxyServer } from "./server";

const server = new ProxyServer({
  wsPort: parseInt(process.env.WS_PORT || "9876"),
  mcpPort: parseInt(process.env.MCP_PORT || "9877"),
  skipAuth: process.env.SKIP_AUTH === "true",
});

async function main() {
  console.log("ACP Browser Client - Proxy Server");
  console.log("==================================");

  try {
    await server.start();
    console.log("\nReady. Waiting for Chrome extension to connect...\n");
  } catch (err) {
    console.error("Failed to start server:", (err as Error).message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await server.stop();
  process.exit(0);
});

main();
