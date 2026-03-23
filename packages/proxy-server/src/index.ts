import { ProxyServer } from "./server";

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(`[Config] Invalid port "${value}", using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

const server = new ProxyServer({
  wsPort: parsePort(process.env.WS_PORT, 9876),
  mcpPort: parsePort(process.env.MCP_PORT, 9877),
  skipAuth: process.env.SKIP_AUTH === "true",
});

async function main() {
  console.log("Agents In Browser - Proxy Server");
  console.log("==================================");

  try {
    await server.start();
    console.log("\nReady. Waiting for Chrome extension to connect...\n");
  } catch (err) {
    console.error("Failed to start server:", (err as Error).message);
    process.exit(1);
  }
}

let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Shutting down...`);
  await server.stop();
  process.exit(0);
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));

main();
