import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { AUTH_TOKEN_BYTES } from "@anthropic-ai/acp-browser-shared";

const CONFIG_DIR = join(homedir(), ".acp-browser-client");
const TOKEN_FILE = join(CONFIG_DIR, "auth-token");

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
    if (!existsSync(TOKEN_FILE)) return null;
    return readFileSync(TOKEN_FILE, "utf-8").trim();
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
