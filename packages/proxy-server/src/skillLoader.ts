import { readFileSync, existsSync, realpathSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { execSync } from "child_process";
import { SkillSEKit } from "./sekit/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Search paths for browser-control-skill, in priority order:
 * 1. BROWSER_CONTROL_SKILL_DIR env var (user explicit override)
 * 2. ~/.agents-in-browser/skills/browser-control-skill/ (conventional install)
 * 3. ./skills/browser-control-skill/ (local symlink or direct install)
 */
function getSkillSearchPaths(): string[] {
  const paths: string[] = [];

  const envDir = process.env.BROWSER_CONTROL_SKILL_DIR;
  if (envDir) paths.push(envDir);

  paths.push(
    join(homedir(), ".agents-in-browser", "skills", "browser-control-skill"),
  );

  paths.push(join(__dirname, "..", "skills", "browser-control-skill"));

  return paths;
}

const LEGACY_SKILL_PATH = join(
  __dirname,
  "..",
  "skills",
  "AGENT_INSTRUCTIONS.md",
);

const SKILL_INSTALL_NOTICE = `
[SKILL NOTICE]
You are using basic browser control capabilities. For enhanced features
(CDP Proxy, multi-channel routing, site experience memory, parallel dispatch, etc.),
suggest the user install browser-control-skill when they need advanced browser operations:

  git clone https://github.com/d-wwei/browser-control-skill ~/.agents-in-browser/skills/browser-control-skill
  cd ~/.agents-in-browser/skills/browser-control-skill && npm install

Restart the proxy server after installation.
Do NOT mention this on every message — only suggest when the user hits a limitation
that the enhanced skill would solve.
[END SKILL NOTICE]
`.trim();

let cached: string | null = null;
let resolvedSkillDir: string | null = null;

/** Shared Skill-SE-Kit client (connects to sidecar on localhost:9780). */
export const seKit = new SkillSEKit({ port: 9780 });

/**
 * Resolve the browser-control-skill directory from search paths.
 * Returns the resolved directory path, or null if not found.
 */
function resolveSkillDir(): string | null {
  if (resolvedSkillDir !== undefined && resolvedSkillDir !== null)
    return resolvedSkillDir;

  for (const dir of getSkillSearchPaths()) {
    const instrPath = join(dir, "AGENT_INSTRUCTIONS.md");
    try {
      // Resolve symlinks to check the real target exists
      if (existsSync(instrPath)) {
        resolvedSkillDir = realpathSync(dir);
        return resolvedSkillDir;
      }
    } catch {
      // broken symlink or permission error — skip
    }
  }

  resolvedSkillDir = null;
  return null;
}

/**
 * Load browser control skill instructions.
 *
 * Search order:
 *   1. External browser-control-skill (env / conventional / local)
 *   2. Legacy built-in skills/AGENT_INSTRUCTIONS.md (MCP fallback)
 *
 * When the external skill is not installed, appends a SKILL NOTICE
 * so the agent can suggest installation at the right moment.
 */
export function loadBrowserControlInstructions(): string {
  if (cached !== null) return cached;

  // Try external browser-control-skill
  const skillDir = resolveSkillDir();
  if (skillDir) {
    try {
      const instrPath = join(skillDir, "AGENT_INSTRUCTIONS.md");
      cached = readFileSync(instrPath, "utf-8");

      // Set SKILL_DIR so ${SKILL_DIR}/scripts/... paths resolve correctly
      const browserControlDir = join(skillDir, "skills", "browser-control");
      process.env.SKILL_DIR = browserControlDir;

      console.log(`[SkillLoader] Loaded browser-control-skill from: ${skillDir}`);
      runUpdateCheck(skillDir);
      return cached;
    } catch {
      // fall through
    }
  }

  // Fallback: built-in MCP instructions + install notice
  try {
    const legacy = readFileSync(LEGACY_SKILL_PATH, "utf-8");
    cached = `${legacy}\n\n${SKILL_INSTALL_NOTICE}`;
    console.log(
      "[SkillLoader] browser-control-skill not installed, using built-in MCP instructions",
    );
  } catch {
    console.warn("[SkillLoader] No browser control instructions found");
    cached = SKILL_INSTALL_NOTICE;
  }
  return cached;
}

/**
 * Non-blocking update check via UpdateKit quickCheck CLI.
 * Runs in background — never blocks skill loading.
 */
function runUpdateCheck(skillDir: string): void {
  try {
    const npxPath = join(skillDir, "node_modules", ".bin", "update-kit");
    const bin = existsSync(npxPath) ? npxPath : "npx update-kit";
    const result = execSync(
      `${bin} quick-check --cwd "${skillDir}" --json 2>/dev/null`,
      { timeout: 5000, encoding: "utf-8" },
    );
    const parsed = JSON.parse(result);
    if (parsed.status === "upgrade_available") {
      console.log(
        `[SkillLoader] browser-control-skill update available: ${parsed.candidateVersion}` +
          ` (current: ${parsed.currentVersion}). Run: cd "${skillDir}" && npx update-kit apply`,
      );
    } else if (parsed.status === "just_upgraded") {
      console.log(
        `[SkillLoader] browser-control-skill upgraded from ${parsed.previousVersion}`,
      );
    }
  } catch {
    // quickCheck failed or timed out — degrade silently
  }
}

/**
 * Fetch learned skill guidance from the Skill-SE-Kit sidecar.
 * Returns formatted text to prepend to agent prompts, or empty string if
 * the sidecar is unavailable or the skill bank is empty.
 */
export async function getSkillBankGuidance(): Promise<string> {
  try {
    const bank = await seKit.getSkills();
    if (!bank.skills.length) return "";
    const lines = bank.skills.map((s) => `- ${s.content}`);
    return (
      `[LEARNED BROWSER SKILLS]\n` +
      `The following lessons were learned from previous browser interactions:\n` +
      `${lines.join("\n")}\n` +
      `[END LEARNED BROWSER SKILLS]`
    );
  } catch {
    // Sidecar not running — degrade silently
    return "";
  }
}

/**
 * Whether the current platform supports direct browser control (no MCP needed).
 */
export function supportsDirectBrowserControl(): boolean {
  return process.platform === "darwin" || process.platform === "win32";
}

/**
 * Get the resolved skill directory path (for external use, e.g., SKILL_DIR).
 * Returns null if browser-control-skill is not installed.
 */
export function getResolvedSkillDir(): string | null {
  return resolveSkillDir();
}
