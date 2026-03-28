import { spawn, execSync, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
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

const SEKIT_PORT = parsePort(process.env.SEKIT_PORT, 9780);
const SEKIT_SKILL_ROOT = process.env.SEKIT_SKILL_ROOT ?? join(homedir(), ".agents-in-browser", "skills");

let sidecarProcess: ChildProcess | null = null;

/** Check if a sidecar is already running on the target port. */
async function isSidecarAlive(): Promise<boolean> {
  try {
    const resp = await fetch(`http://127.0.0.1:${SEKIT_PORT}/health`);
    const data = await resp.json() as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

/** Start the skill-se-kit sidecar if available. Non-blocking, degrades silently. */
async function startSidecar(): Promise<void> {
  // Reuse existing sidecar if already running (e.g. started manually or by another instance)
  if (await isSidecarAlive()) {
    console.log(`[Sidecar] Already running on port ${SEKIT_PORT} — reusing`);
    return;
  }

  try {
    const child = spawn("skill-se-kit", [
      "serve",
      "--skill-root", SEKIT_SKILL_ROOT,
      "--port", String(SEKIT_PORT),
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    child.on("error", () => {
      console.log("[Sidecar] skill-se-kit not found — skill evolution disabled");
      sidecarProcess = null;
    });

    child.on("exit", (code) => {
      if (code !== null && code !== 0 && !shuttingDown) {
        console.warn(`[Sidecar] Exited with code ${code}`);
      }
      sidecarProcess = null;
    });

    child.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[Sidecar] ${msg}`);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes("GET /") && !msg.includes("POST /")) {
        console.warn(`[Sidecar] ${msg}`);
      }
    });

    sidecarProcess = child;
  } catch {
    console.log("[Sidecar] Failed to start — skill evolution disabled");
  }
}

function stopSidecar(): void {
  if (!sidecarProcess || !sidecarProcess.pid) return;
  try {
    sidecarProcess.kill("SIGTERM");
  } catch { /* already dead */ }
  sidecarProcess = null;
  console.log("[Sidecar] Stopped");
}

const server = new ProxyServer({
  wsPort: parsePort(process.env.WS_PORT, 9876),
  mcpPort: parsePort(process.env.MCP_PORT, 9877),
  skipAuth: process.env.SKIP_AUTH === "true",
});

async function main() {
  console.log("Agents In Browser - Proxy Server");
  console.log("==================================");

  await startSidecar();

  try {
    await server.start();
    console.log("\nReady. Waiting for Chrome extension to connect...\n");
  } catch (err) {
    console.error("Failed to start server:", (err as Error).message);
    stopSidecar();
    process.exit(1);
  }
}

let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Shutting down...`);
  stopSidecar();
  await server.stop();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// First-run autostart prompt
// ---------------------------------------------------------------------------

const DATA_DIR = join(homedir(), ".agents-in-browser");
const PROMPTED_FLAG = join(DATA_DIR, ".autostart-prompted");
const PLIST_LABEL = "com.agents-in-browser.proxy";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);

function askQuestion(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function resolveNpxPath(): string {
  try {
    return execSync("which npx", { encoding: "utf-8" }).trim();
  } catch {
    return "/opt/homebrew/bin/npx";
  }
}

function resolveSkillSEKitBinDir(): string {
  try {
    const p = execSync("which skill-se-kit", { encoding: "utf-8" }).trim();
    return dirname(p);
  } catch {
    return "";
  }
}

function generatePlist(workingDir: string): string {
  const npxPath = resolveNpxPath();
  const nodeBinDir = dirname(npxPath);
  const sekitBinDir = resolveSkillSEKitBinDir();
  const pathParts = [nodeBinDir, sekitBinDir, "/usr/local/bin", "/usr/bin", "/bin"]
    .filter(Boolean);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${npxPath}</string>
        <string>tsx</string>
        <string>src/index.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${workingDir}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${pathParts.join(":")}</string>
        <key>HOME</key>
        <string>${homedir()}</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>${join(DATA_DIR, "proxy.log")}</string>
    <key>StandardErrorPath</key>
    <string>${join(DATA_DIR, "proxy.log")}</string>
</dict>
</plist>`;
}

async function promptAutostart(): Promise<void> {
  // Only on macOS
  if (process.platform !== "darwin") return;

  // Don't ask if already prompted or running under launchd
  if (existsSync(PROMPTED_FLAG)) return;
  if (process.env.__LAUNCHED_BY_LAUNCHD || process.ppid === 1) return;

  // Don't ask if plist already exists
  if (existsSync(PLIST_PATH)) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(PROMPTED_FLAG, new Date().toISOString());
    return;
  }

  // Don't ask in non-interactive mode (piped stdin)
  if (!process.stdin.isTTY) return;

  console.log("\n┌────────────────────────────────────────────────┐");
  console.log("│  First-time setup detected.                    │");
  console.log("│  Set proxy server to start on login?           │");
  console.log("│  (Includes skill-evolution sidecar auto-start) │");
  console.log("└────────────────────────────────────────────────┘");

  const answer = await askQuestion("\nEnable auto-start on login? [Y/n] ");

  mkdirSync(DATA_DIR, { recursive: true });

  if (answer === "" || answer === "y" || answer === "yes") {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const workingDir = join(__dirname, "..");
    const plist = generatePlist(workingDir);

    const plistDir = dirname(PLIST_PATH);
    mkdirSync(plistDir, { recursive: true });
    writeFileSync(PLIST_PATH, plist);

    try {
      execSync(`launchctl load "${PLIST_PATH}"`, { stdio: "pipe" });
      console.log("\n✓ Auto-start enabled. Proxy will start on login.");
      console.log(`  Plist: ${PLIST_PATH}`);
      console.log(`  Log:   ${join(DATA_DIR, "proxy.log")}`);
      console.log(`\n  Manage with:`);
      console.log(`    launchctl unload "${PLIST_PATH}"   # disable`);
      console.log(`    launchctl load "${PLIST_PATH}"     # re-enable\n`);
    } catch (err) {
      console.warn(`\n⚠ Failed to load plist: ${(err as Error).message}`);
      console.log(`  Plist written to: ${PLIST_PATH}`);
      console.log(`  You can load it manually: launchctl load "${PLIST_PATH}"\n`);
    }
  } else {
    console.log("\n✓ Skipped. You can set this up later by running:");
    console.log(`  launchctl load "${PLIST_PATH}"\n`);
  }

  writeFileSync(PROMPTED_FLAG, JSON.stringify({
    prompted_at: new Date().toISOString(),
    choice: answer === "" || answer === "y" || answer === "yes" ? "enabled" : "skipped",
  }));
}

// ---------------------------------------------------------------------------

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("exit", () => stopSidecar());

(async () => {
  await promptAutostart();
  await main();
})();
