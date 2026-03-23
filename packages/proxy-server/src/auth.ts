import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { AUTH_TOKEN_BYTES } from "@anthropic-ai/agents-in-browser-shared";

const CONFIG_DIR = join(homedir(), ".agents-in-browser");
const TOKEN_FILE = join(CONFIG_DIR, "auth-token");
const LEGACY_CONFIG_DIR = join(homedir(), ".acp-browser-client");
const LEGACY_TOKEN_FILE = join(LEGACY_CONFIG_DIR, "auth-token");

export function getOrCreateAuthToken(): string {
  // Reuse existing token if available
  const existing = readAuthToken();
  if (existing) return existing;

  // Generate new token only if none exists
  const token = randomBytes(AUTH_TOKEN_BYTES).toString("hex");

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  writeFileSync(TOKEN_FILE, token, { mode: 0o600 });

  return token;
}

export function readAuthToken(): string | null {
  try {
    if (existsSync(TOKEN_FILE)) {
      return readFileSync(TOKEN_FILE, "utf-8").trim();
    }
    // Backward compatibility: reuse legacy token if present.
    if (existsSync(LEGACY_TOKEN_FILE)) {
      return readFileSync(LEGACY_TOKEN_FILE, "utf-8").trim();
    }
    return null;
  } catch {
    return null;
  }
}

export function validateOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  // Only allow Chrome extension origins
  return origin.startsWith("chrome-extension://");
}

export function validateToken(
  url: string | undefined,
  expectedToken: string,
): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("token") === expectedToken;
  } catch {
    return false;
  }
}
