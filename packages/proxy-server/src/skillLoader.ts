import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRIMARY_SKILL_PATH = join(
  __dirname,
  "..",
  "skills",
  "browser-control-skill",
  "AGENT_INSTRUCTIONS.md",
);

const LEGACY_SKILL_PATH = join(
  __dirname,
  "..",
  "skills",
  "AGENT_INSTRUCTIONS.md",
);

let cached: string | null = null;

/**
 * Load browser control skill instructions.
 * Primary path: skills/browser-control-skill/AGENT_INSTRUCTIONS.md
 * Legacy fallback: skills/AGENT_INSTRUCTIONS.md
 */
export function loadBrowserControlInstructions(): string {
  if (cached !== null) return cached;
  try {
    cached = readFileSync(PRIMARY_SKILL_PATH, "utf-8");
    console.log("[SkillLoader] Loaded browser control instructions from primary path");
    return cached;
  } catch {
    // fallback below
  }

  try {
    cached = readFileSync(LEGACY_SKILL_PATH, "utf-8");
    console.log("[SkillLoader] Loaded browser control instructions from legacy path");
  } catch {
    console.warn("[SkillLoader] browser-control instructions not found, skipping");
    cached = "";
  }
  return cached;
}

/**
 * Whether the current platform supports direct browser control (no MCP needed).
 */
export function supportsDirectBrowserControl(): boolean {
  return process.platform === "darwin" || process.platform === "win32";
}
