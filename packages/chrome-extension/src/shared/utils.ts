import { SENSITIVE_SITE_PATTERNS, PAYMENT_BUTTON_PATTERNS, PASSWORD_FIELD_SELECTORS } from "./constants";

/**
 * Check if a URL matches any sensitive site pattern.
 */
export function isSensitiveSite(url: string): boolean {
  if (!url) return false;
  return SENSITIVE_SITE_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Check if a URL is a Chrome internal page that cannot be scripted.
 */
export function isChromeInternalUrl(url: string): boolean {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-search://") ||
    url.startsWith("devtools://")
  );
}

/**
 * Check if button text matches a payment action pattern.
 */
export function isPaymentButton(text: string): boolean {
  if (!text) return false;
  return PAYMENT_BUTTON_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

/**
 * Check if an element matches a password field selector.
 */
export function isPasswordFieldSelector(selector: string): boolean {
  if (!selector) return false;
  const lower = selector.toLowerCase();
  return PASSWORD_FIELD_SELECTORS.some((s) => lower.includes(s.replace(/\s*i\]$/, "]").toLowerCase()));
}

/**
 * Validate and normalize a URL for navigation.
 * Returns the normalized URL or null if invalid/blocked.
 */
export function normalizeNavigationUrl(url: string): string | null {
  if (!url) return null;

  // Block dangerous protocols early
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:") || trimmed.startsWith("vbscript:")) {
    return null;
  }

  // If no protocol, prepend https
  let normalized = url;
  if (!/^https?:\/\//i.test(normalized) && !normalized.startsWith("about:")) {
    normalized = `https://${normalized}`;
  }

  // Block non-http(s) protocols
  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }

  try {
    new URL(normalized);
    return normalized;
  } catch {
    return null;
  }
}

/**
 * Truncate a string with a suffix indicator.
 */
export function truncate(str: string, maxLength: number, suffix = "…[truncated]"): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Generate a unique ID for attachments/quotes.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Safely serialize a value to JSON, handling circular references.
 */
export function safeStringify(value: unknown, maxBytes = 1_048_576): string {
  const seen = new WeakSet();
  let result: string;
  try {
    result = JSON.stringify(value, (_key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      if (typeof val === "function") return "[Function]";
      if (typeof val === "symbol") return val.toString();
      if (typeof val === "bigint") return val.toString();
      return val;
    });
  } catch {
    result = String(value);
  }

  if (result.length > maxBytes) {
    return result.slice(0, maxBytes) + "…[truncated]";
  }
  return result;
}
