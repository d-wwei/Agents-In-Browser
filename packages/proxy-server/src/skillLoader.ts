import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { SkillSEKit } from "./sekit/index.js";

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

/** Shared Skill-SE-Kit client (connects to sidecar on localhost:9780). */
export const seKit = new SkillSEKit({ port: 9780 });

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
