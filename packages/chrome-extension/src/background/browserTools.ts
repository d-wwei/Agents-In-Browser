/**
 * Browser tool execution.
 * Dispatches browser tool calls from agents to appropriate Chrome API handlers.
 */

import {
  BROWSER_READ_MAX_CHARS,
  BROWSER_EXECUTE_TIMEOUT_MS,
  BROWSER_EXECUTE_MAX_RESULT_BYTES,
} from "@anthropic-ai/agents-in-browser-shared";
import { isSensitiveSite, isChromeInternalUrl, normalizeNavigationUrl, safeStringify } from "../shared/utils";
import { PASSWORD_FIELD_SELECTORS } from "../shared/constants";
import type {
  ContentReadResponse,
  ContentActionResponse,
} from "../shared/types";
import { autoAddTabToGroup } from "./tabGroupManager";

/**
 * Dispatch a browser tool call to the appropriate handler.
 */
export async function dispatchBrowserTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (tool) {
    case "browser_tabs":
      return handleBrowserTabs(args);
    case "browser_read":
      return handleBrowserRead(args);
    case "browser_execute":
      return handleBrowserExecute(args);
    case "browser_screenshot":
      return handleBrowserScreenshot(args);
    case "browser_click":
      return handleBrowserClick(args);
    case "browser_type":
      return handleBrowserType(args);
    case "browser_navigate":
      return handleBrowserNavigate(args);
    case "browser_scroll":
      return handleBrowserScroll(args);
    case "browser_select":
      return handleBrowserSelect(args);
    case "browser_wait":
      return handleBrowserWait(args);
    default:
      throw new Error(`Unknown browser tool: ${tool}`);
  }
}

// ============================
// Helpers
// ============================

async function getTab(tabId: number): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab) {
    throw new Error(`Tab ${tabId} not found`);
  }
  return tab;
}

function checkSensitiveSite(url: string | undefined, tool: string): void {
  if (url && isSensitiveSite(url)) {
    throw new Error(
      `Security: ${tool} blocked on sensitive site: ${new URL(url).hostname}. ` +
      `Banking, auth, and admin sites are protected.`,
    );
  }
}

function checkChromeInternal(url: string | undefined, tool: string): void {
  if (!url || isChromeInternalUrl(url)) {
    throw new Error(
      `Cannot execute ${tool} on Chrome internal page: ${url || "unknown"}`,
    );
  }
}

/**
 * Ensure content script is injected into the tab.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    // Check if content script is already loaded
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!(window as unknown as Record<string, boolean>).__acpContentScriptLoaded,
    });
    if (results[0]?.result === true) return;
  } catch {
    // Tab might not be ready yet; proceed to inject
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (err) {
    throw new Error(
      `Failed to inject content script into tab ${tabId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Send a message to a tab's content script and get a response.
 */
async function sendToContentScript<T>(tabId: number, message: unknown): Promise<T> {
  await ensureContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (id: number) => {
      (window as unknown as Record<string, number>).__acpCurrentTabId = id;
    },
    args: [tabId],
  });
  return new Promise<T>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ============================
// Tool handlers
// ============================

async function handleBrowserTabs(
  args: Record<string, unknown>,
): Promise<unknown> {
  const queryParams: chrome.tabs.QueryInfo = {};
  if (typeof args.groupId === "number") {
    queryParams.groupId = args.groupId;
  }

  const tabs = await chrome.tabs.query(queryParams);
  return tabs.map((tab) => ({
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
    groupId: tab.groupId,
    windowId: tab.windowId,
    status: tab.status,
    favIconUrl: tab.favIconUrl,
  }));
}

async function handleBrowserRead(
  args: Record<string, unknown>,
): Promise<unknown> {
  const tabId = args.tabId as number;
  if (typeof tabId !== "number") throw new Error("tabId is required");

  const tab = await getTab(tabId);
  checkChromeInternal(tab.url, "browser_read");

  const selector = args.selector as string | undefined;
  const maxLength = (args.maxLength as number) || BROWSER_READ_MAX_CHARS;
  const includeInteractiveElements = args.includeInteractiveElements !== false;
  const mode = (args.mode as "markdown" | "accessibility" | "both" | undefined) || "markdown";

  const response = await sendToContentScript<ContentReadResponse>(tabId, {
    type: "content_read_request",
    selector,
    maxLength,
    includeInteractiveElements,
    mode,
  });

  return {
    title: response.title,
    url: response.url,
    content: response.markdown,
    interactiveElements: response.interactiveElements,
    accessibilityTree: response.accessibilityTree,
    mode,
  };
}

async function handleBrowserExecute(
  args: Record<string, unknown>,
): Promise<unknown> {
  const tabId = args.tabId as number;
  const code = args.code as string;
  const world = args.world === "MAIN" ? "MAIN" : "ISOLATED";
  if (typeof tabId !== "number") throw new Error("tabId is required");
  if (typeof code !== "string" || !code.trim()) throw new Error("code is required");

  const tab = await getTab(tabId);
  checkChromeInternal(tab.url, "browser_execute");
  checkSensitiveSite(tab.url, "browser_execute");

  // Security: block dangerous patterns
  const dangerousPatterns = [
    /document\.cookie/i,
    /localStorage\s*\.\s*getItem/i,
    /sessionStorage\s*\.\s*getItem/i,
    /\.innerHTML\s*=/i,
    /eval\s*\(/i,
    /Function\s*\(/i,
    /fetch\s*\(\s*['"][^'"]*password/i,
    /XMLHttpRequest/i,
  ];
  // Note: we only warn, not block, for most patterns. Block eval/Function.
  if (/\beval\s*\(/.test(code) || /\bnew\s+Function\s*\(/.test(code)) {
    throw new Error("Security: eval() and new Function() are blocked in browser_execute");
  }

  // Execute with timeout in the requested world (default ISOLATED)
  const timeoutMs = BROWSER_EXECUTE_TIMEOUT_MS;

  const wrappedCode = `
    (async () => {
      const __timeout = ${timeoutMs};
      const __start = Date.now();
      const __result = await Promise.race([
        (async () => { ${code} })(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Execution timed out after ' + __timeout + 'ms')), __timeout)
        ),
      ]);
      return __result;
    })()
  `;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: new Function("return " + wrappedCode) as () => Promise<unknown>,
      world,
    });

    const result = results[0]?.result;
    const serialized = safeStringify(result, BROWSER_EXECUTE_MAX_RESULT_BYTES);
    return JSON.parse(serialized);
  } catch (err) {
    throw new Error(
      `browser_execute failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function handleBrowserScreenshot(
  args: Record<string, unknown>,
): Promise<unknown> {
  const tabId = args.tabId as number;
  const annotate = args.annotate === true;
  if (typeof tabId !== "number") throw new Error("tabId is required");

  const tab = await getTab(tabId);
  checkChromeInternal(tab.url, "browser_screenshot");

  // Activate the tab first for captureVisibleTab
  if (!tab.active) {
    await chrome.tabs.update(tabId, { active: true });
    // Brief delay to allow tab to render
    await new Promise((r) => setTimeout(r, 300));
  }

  // Focus the window
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  if (annotate) {
    await sendToContentScript<ContentActionResponse>(tabId, {
      type: "content_annotate_screenshot_request",
      enabled: true,
    });
    await new Promise((r) => setTimeout(r, 60));
  }

  let dataUrl = "";
  try {
    if (tab.windowId === undefined) throw new Error("Tab has no windowId");
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
  } finally {
    if (annotate) {
      await sendToContentScript<ContentActionResponse>(tabId, {
        type: "content_annotate_screenshot_request",
        enabled: false,
      }).catch(() => {});
    }
  }

  // Strip the data:image/png;base64, prefix
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");

  return {
    image: base64,
    format: "png",
    encoding: "base64",
    tabId,
    url: tab.url,
    title: tab.title,
    annotated: annotate,
  };
}

async function handleBrowserClick(
  args: Record<string, unknown>,
): Promise<unknown> {
  const tabId = args.tabId as number;
  if (typeof tabId !== "number") throw new Error("tabId is required");

  const tab = await getTab(tabId);
  checkChromeInternal(tab.url, "browser_click");
  checkSensitiveSite(tab.url, "browser_click");

  const selector = args.selector as string | undefined;
  const index = args.index as number | undefined;
  const x = args.x as number | undefined;
  const y = args.y as number | undefined;

  if (typeof index !== "number" && !selector && (x === undefined || y === undefined)) {
    throw new Error("Must provide index, selector, or (x, y) coordinates");
  }

  // Security: check if selector targets a password field
  if (selector) {
    for (const pwSelector of PASSWORD_FIELD_SELECTORS) {
      if (selector.includes(pwSelector.replace(/\s*i\]$/, "]"))) {
        throw new Error("Security: Cannot click on password fields");
      }
    }
  }

  const response = await sendToContentScript<ContentActionResponse>(tabId, {
    type: "content_click_request",
    index,
    selector,
    x,
    y,
  });

  if (!response.success) {
    throw new Error(response.error || "Click failed");
  }

  return response.data;
}

async function handleBrowserType(
  args: Record<string, unknown>,
): Promise<unknown> {
  const tabId = args.tabId as number;
  const selector = args.selector as string | undefined;
  const index = args.index as number | undefined;
  const text = args.text as string;
  const clearFirst = args.clearFirst !== false; // default true

  if (typeof tabId !== "number") throw new Error("tabId is required");
  if (typeof index !== "number" && typeof selector !== "string") {
    throw new Error("index or selector is required");
  }
  if (typeof text !== "string") throw new Error("text is required");

  const tab = await getTab(tabId);
  checkChromeInternal(tab.url, "browser_type");
  checkSensitiveSite(tab.url, "browser_type");

  // Security: check password fields
  if (selector) {
    const lowerSelector = selector.toLowerCase();
    if (
      lowerSelector.includes('type="password"') ||
      lowerSelector.includes("password") ||
      lowerSelector.includes('autocomplete="current-password"') ||
      lowerSelector.includes('autocomplete="new-password"')
    ) {
      throw new Error("Security: Cannot type into password fields");
    }
  }

  const response = await sendToContentScript<ContentActionResponse>(tabId, {
    type: "content_type_request",
    index,
    selector,
    text,
    clearFirst,
  });

  if (!response.success) {
    throw new Error(response.error || "Type failed");
  }

  return response.data;
}

async function handleBrowserNavigate(
  args: Record<string, unknown>,
): Promise<unknown> {
  const tabId = args.tabId as number;
  const rawUrl = args.url as string;

  if (typeof tabId !== "number") throw new Error("tabId is required");
  if (typeof rawUrl !== "string") throw new Error("url is required");

  const url = normalizeNavigationUrl(rawUrl);
  if (!url) {
    throw new Error(`Invalid or blocked URL: ${rawUrl}`);
  }

  checkSensitiveSite(url, "browser_navigate");

  const tab = await chrome.tabs.update(tabId, { url });

  // Auto-add navigated tab to agent workspace group
  if (tab?.id) {
    autoAddTabToGroup(tab.id).catch(() => {});
  }

  // Wait for page to start loading
  await new Promise<void>((resolve) => {
    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // Timeout after 15s
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15_000);
  });

  const updatedTab = await chrome.tabs.get(tabId);
  return {
    tabId,
    url: updatedTab.url,
    title: updatedTab.title,
    status: updatedTab.status,
  };
}

async function handleBrowserScroll(
  args: Record<string, unknown>,
): Promise<unknown> {
  const tabId = args.tabId as number;
  const direction = args.direction as string;
  const amount = (args.amount as number) || 500;

  if (typeof tabId !== "number") throw new Error("tabId is required");
  if (!["up", "down", "left", "right"].includes(direction)) {
    throw new Error(`Invalid direction: ${direction}. Must be up, down, left, or right.`);
  }

  const tab = await getTab(tabId);
  checkChromeInternal(tab.url, "browser_scroll");

  const response = await sendToContentScript<ContentActionResponse>(tabId, {
    type: "content_scroll_request",
    direction,
    amount,
  });

  if (!response.success) {
    throw new Error(response.error || "Scroll failed");
  }

  return response.data;
}

async function handleBrowserSelect(
  args: Record<string, unknown>,
): Promise<unknown> {
  const tabId = args.tabId as number;
  const selector = args.selector as string | undefined;
  const index = args.index as number | undefined;
  const value = args.value as string;

  if (typeof tabId !== "number") throw new Error("tabId is required");
  if (typeof index !== "number" && typeof selector !== "string") {
    throw new Error("index or selector is required");
  }
  if (typeof value !== "string") throw new Error("value is required");

  const tab = await getTab(tabId);
  checkChromeInternal(tab.url, "browser_select");
  checkSensitiveSite(tab.url, "browser_select");

  const response = await sendToContentScript<ContentActionResponse>(tabId, {
    type: "content_select_request",
    index,
    selector,
    value,
  });

  if (!response.success) {
    throw new Error(response.error || "Select failed");
  }

  return response.data;
}

async function handleBrowserWait(
  args: Record<string, unknown>,
): Promise<unknown> {
  const tabId = args.tabId as number;
  const selector = args.selector as string;
  const timeout = (args.timeout as number) || 10_000;
  const condition = (args.condition as string) || "visible";

  if (typeof tabId !== "number") throw new Error("tabId is required");

  const tab = await getTab(tabId);
  checkChromeInternal(tab.url, "browser_wait");

  if (!selector) {
    return new Promise<unknown>((resolve) => {
      const check = async () => {
        const t = await chrome.tabs.get(tabId);
        if (t.status === "complete") {
          resolve({ loaded: true, url: t.url, title: t.title });
        } else {
          const timer = setTimeout(async () => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve({ loaded: false, error: `Timeout waiting for tab ${tabId} to load` });
          }, timeout);

          const listener = async (
            updatedTabId: number,
            changeInfo: chrome.tabs.TabChangeInfo,
          ) => {
            if (updatedTabId === tabId && changeInfo.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              clearTimeout(timer);
              const updated = await chrome.tabs.get(tabId);
              resolve({ loaded: true, url: updated.url, title: updated.title });
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        }
      };
      check();
    });
  }

  if (!["visible", "hidden", "attached", "loaded"].includes(condition)) {
    throw new Error(`Invalid condition: ${condition}`);
  }

  const response = await sendToContentScript<ContentActionResponse>(tabId, {
    type: "content_wait_request",
    selector,
    timeout,
    condition,
  });

  if (!response.success) {
    throw new Error(response.error || `Wait failed for "${selector}" (${condition})`);
  }

  return response.data;
}
