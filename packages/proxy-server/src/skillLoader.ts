import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(
  __dirname,
  "..",
  "skills",
  "browser-control-skill",
  "AGENT_INSTRUCTIONS.md",
);

let cached: string | null = null;

/**
 * Load browser control skill instructions from the submodule.
 * Returns the full AGENT_INSTRUCTIONS.md content, or empty string if not found.
 */
export function loadBrowserControlInstructions(): string {
  if (cached !== null) return cached;
  try {
    cached = readFileSync(SKILL_PATH, "utf-8");
    console.log("[SkillLoader] Loaded browser control instructions");
  } catch {
    console.warn("[SkillLoader] browser-control-skill not found, skipping");
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
