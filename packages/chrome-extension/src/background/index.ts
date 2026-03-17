/**
 * Background service worker entry point.
 * Handles extension lifecycle, message routing, context menus,
 * keyboard commands, and browser tool dispatch.
 */

import { registerContextMenus, handleContextMenuClick } from "./contextMenuManager";
import { initNotificationListeners, createNotification } from "./notificationManager";
import { handleTabGroupMessage } from "./tabGroupManager";
import { dispatchBrowserTool } from "./browserTools";
import { generateId } from "../shared/utils";
import type {
  BrowserToolRequest,
  BrowserToolResponse,
  QuoteToChatMessage,
  TabGroupUpdate,
  NotificationRequest,
  AgentStatusUpdate,
  BrowserStateRequest,
  BrowserStateResponse,
  ContentSelectionQuote,
  ContentImageQuote,
  MainWorldExecuteRequest,
  MainWorldStatusRequest,
  MainWorldStopRequest,
} from "../shared/types";
import { REFERENCE_PREVIEW_MAX_CHARS } from "@anthropic-ai/acp-browser-shared";

const AGENT_STATE_KEY = "acpAgentState";

async function writeAgentState(agentActive: boolean, activeTabId: number | null): Promise<void> {
  const next = {
    agentActive,
    activeTabId,
    lastHeartbeat: Date.now(),
  };
  await chrome.storage.local.set({ [AGENT_STATE_KEY]: next });

  if (typeof activeTabId === "number") {
    if (agentActive) {
      await ensureMainWorldScript(activeTabId).catch(() => {});
    }
    try {
      await chrome.tabs.sendMessage(activeTabId, {
        type: "agent_state_sync",
        ...next,
      });
    } catch {
      // tab may not have content script yet
    }
  }
}

async function readAgentState(): Promise<{ agentActive: boolean; activeTabId: number | null }> {
  const result = await chrome.storage.local.get(AGENT_STATE_KEY);
  const state = result[AGENT_STATE_KEY] as { agentActive?: boolean; activeTabId?: number | null } | undefined;
  return {
    agentActive: state?.agentActive === true,
    activeTabId: typeof state?.activeTabId === "number" ? state.activeTabId : null,
  };
}



async function requireActiveAgentTab(senderTabId: number | undefined): Promise<number> {
  if (typeof senderTabId !== "number") {
    throw new Error("No sender tab context");
  }

  const state = await readAgentState();
  if (!state.agentActive || state.activeTabId !== senderTabId) {
    throw new Error("Agent is not active for this tab");
  }

  return senderTabId;
}

async function ensureMainWorldScript(tabId: number): Promise<void> {
  const existing = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => typeof (window as unknown as { AGENTS_IN_BROWSER?: unknown }).AGENTS_IN_BROWSER !== "undefined",
  }).catch(() => []);

  if (existing[0]?.result === true) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["mainWorld.js"],
    world: "MAIN",
  });
}

writeAgentState(false, null).catch(() => {});

// ============================
// Extension lifecycle
// ============================

// Open side panel on action (toolbar icon) click
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId !== undefined) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch {
      // Side panel might already be open
    }
  }
});

// Register context menus and initialize on install
chrome.runtime.onInstalled.addListener((details) => {
  registerContextMenus();

  if (details.reason === "install") {
    // First install: could show onboarding
    console.log("[ACP] Extension installed");
  } else if (details.reason === "update") {
    console.log(`[ACP] Extension updated to ${chrome.runtime.getManifest().version}`);
  }
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const state = await readAgentState().catch(() => ({ agentActive: false, activeTabId: null }));
  if (state.agentActive && state.activeTabId === tabId) {
    await ensureMainWorldScript(tabId).catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const state = await readAgentState().catch(() => ({ agentActive: false, activeTabId: null }));
  if (state.agentActive && state.activeTabId === tabId) {
    await ensureMainWorldScript(tabId).catch(() => {});
  }
});

// Initialize notification listeners
initNotificationListeners();

// ============================
// Keyboard command handler
// ============================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "quote-to-chat") {
    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;

      // Try to get selection from the active tab
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          return selection ? selection.toString().trim() : "";
        },
      });

      const selectedText = results[0]?.result as string;

      if (selectedText) {
        // Send selection to side panel as a quote
        const message: QuoteToChatMessage = {
          type: "quote_to_chat",
          attachment: {
            id: generateId(),
            type: "text",
            content: selectedText,
            source: {
              url: tab.url || "",
              title: tab.title || "",
            },
            preview: selectedText.slice(0, REFERENCE_PREVIEW_MAX_CHARS),
          },
        };

        await chrome.runtime.sendMessage(message).catch(() => {
          // Side panel may not be listening; open it
        });
      }

      // Always open the side panel when shortcut is pressed
      if (tab.windowId !== undefined) {
        await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
      }
    } catch (err) {
      console.error("[ACP] quote-to-chat command error:", err);
    }
  }
});

// ============================
// Message routing
// ============================

chrome.runtime.onMessage.addListener(
  (
    message: BrowserToolRequest | TabGroupUpdate | NotificationRequest | AgentStatusUpdate | BrowserStateRequest | ContentSelectionQuote | ContentImageQuote | { type: string },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    // Route based on message type
    switch (message.type) {
      // Browser tool requests from side panel
      case "browser_tool_request": {
        const req = message as BrowserToolRequest;
        handleBrowserToolRequest(req)
          .then((response) => sendResponse(response))
          .catch((err) => {
            const errResponse: BrowserToolResponse = {
              type: "browser_tool_response",
              callId: req.callId,
              error: err instanceof Error ? err.message : String(err),
            };
            sendResponse(errResponse);
          });
        return true; // async response
      }

      // Tab group management from side panel
      case "tab_group_update": {
        const req = message as TabGroupUpdate;
        handleTabGroupMessage(req)
          .then((result) => {
            sendResponse({ type: "tab_group_result", ...result });
          })
          .catch((err) => {
            sendResponse({
              type: "tab_group_result",
              error: err instanceof Error ? err.message : String(err),
            });
          });
        return true;
      }

      // Notification requests from side panel
      case "notification_request": {
        const req = message as NotificationRequest;
        const id = createNotification({
          id: req.notificationId,
          title: req.title,
          message: req.message,
          priority: req.priority,
          action: req.action,
          actionTabId: req.actionTabId,
        });
        sendResponse({ notificationId: id });
        return false;
      }

      case "agent_status_update": {
        const req = message as AgentStatusUpdate;
        writeAgentState(req.agentActive, req.activeTabId).catch(() => {});
        sendResponse({ ok: true });
        return false;
      }

      case "browser_state_request": {
        const req = message as BrowserStateRequest;
        collectBrowserStateSnapshot()
          .then((state) => {
            const response: BrowserStateResponse = {
              type: "browser_state_response",
              requestId: req.requestId,
              state,
            };
            sendResponse(response);
          })
          .catch(() => {
            const response: BrowserStateResponse = {
              type: "browser_state_response",
              requestId: req.requestId,
              state: { activeTab: null, tabs: [] },
            };
            sendResponse(response);
          });
        return true;
      }

      case "main_world_execute_request": {
        const req = message as MainWorldExecuteRequest;
        requireActiveAgentTab(sender.tab?.id)
          .then((tabId) => dispatchBrowserTool("browser_execute", {
            tabId,
            code: req.code,
            world: "MAIN",
          }))
          .then((result) => sendResponse({ ok: true, result }))
          .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        return true;
      }

      case "main_world_status_request": {
        readAgentState()
          .then((status) => sendResponse({ ok: true, status }))
          .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        return true;
      }

      case "main_world_stop_request": {
        requireActiveAgentTab(sender.tab?.id)
          .then(() => writeAgentState(false, null))
          .then(() => sendResponse({ ok: true, result: { stopped: true } }))
          .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        return true;
      }

      // Content script selection quote -> forward to side panel
      case "content_selection_quote": {
        const sel = message as ContentSelectionQuote;
        const quoteMsg: QuoteToChatMessage = {
          type: "quote_to_chat",
          attachment: {
            id: generateId(),
            type: "text",
            content: sel.text,
            source: {
              url: sel.url,
              title: sel.title,
            },
            preview: sel.text.slice(0, REFERENCE_PREVIEW_MAX_CHARS),
          },
        };
        // Forward to all extension pages (side panel will pick it up)
        forwardToSidePanel(quoteMsg);
        sendResponse({ ok: true });
        return false;
      }

      // Content script image quote -> forward to side panel
      case "content_image_quote": {
        const img = message as ContentImageQuote;
        const quoteMsg: QuoteToChatMessage = {
          type: "quote_to_chat",
          attachment: {
            id: generateId(),
            type: "image",
            content: img.src,
            source: {
              url: img.url,
              title: img.title,
            },
            preview: `[Image: ${img.alt || img.src.split("/").pop()?.slice(0, 60) || "image"}]`,
          },
        };
        forwardToSidePanel(quoteMsg);
        sendResponse({ ok: true });
        return false;
      }

      default:
        return false;
    }
  },
);

// ============================
// Browser tool request handler
// ============================

async function handleBrowserToolRequest(
  request: BrowserToolRequest,
): Promise<BrowserToolResponse> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await writeAgentState(true, activeTab?.id ?? null);

    const result = await dispatchBrowserTool(request.tool, request.args);
    return {
      type: "browser_tool_response",
      callId: request.callId,
      result,
    };
  } catch (err) {
    return {
      type: "browser_tool_response",
      callId: request.callId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function collectBrowserStateSnapshot(): Promise<BrowserStateResponse["state"]> {
  const tabs = await chrome.tabs.query({});
  const activeTab = tabs.find((t) => t.active && t.windowId === chrome.windows.WINDOW_ID_CURRENT) || tabs.find((t) => t.active) || null;

  let interactiveElements: BrowserStateResponse["state"]["interactiveElements"] = [];
  if (activeTab?.id) {
    try {
      const readResult = await dispatchBrowserTool("browser_read", {
        tabId: activeTab.id,
        maxLength: 8000,
        includeInteractiveElements: true,
      }) as { interactiveElements?: BrowserStateResponse["state"]["interactiveElements"] };
      interactiveElements = readResult.interactiveElements || [];
    } catch {
      interactiveElements = [];
    }
  }

  return {
    activeTab: activeTab
      ? { id: activeTab.id, url: activeTab.url, title: activeTab.title }
      : null,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
    })),
    interactiveElements,
  };
}

// ============================
// Forward messages to side panel
// ============================

/**
 * Forward a message to the side panel by sending to all extension views.
 * The side panel is an extension page and will receive runtime messages.
 */
function forwardToSidePanel(message: QuoteToChatMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open; store in pending queue
    storePendingQuote(message);
  });
}

// Simple pending quote storage (survives until side panel opens)
const PENDING_QUOTES_KEY = "acp_pending_quotes";

async function storePendingQuote(message: QuoteToChatMessage): Promise<void> {
  try {
    const result = await chrome.storage.local.get(PENDING_QUOTES_KEY);
    const pending: QuoteToChatMessage[] = result[PENDING_QUOTES_KEY] || [];
    pending.push(message);
    // Keep at most 10 pending quotes
    const trimmed = pending.slice(-10);
    await chrome.storage.local.set({ [PENDING_QUOTES_KEY]: trimmed });
  } catch {
    // Storage may not be available
  }
}

// ============================
// Side panel connection management
// ============================

// When side panel connects, flush pending quotes
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidepanel") {
    // Flush pending quotes
    chrome.storage.local.get(PENDING_QUOTES_KEY).then((result) => {
      const pending: QuoteToChatMessage[] = result[PENDING_QUOTES_KEY] || [];
      if (pending.length > 0) {
        for (const msg of pending) {
          port.postMessage(msg);
        }
        chrome.storage.local.remove(PENDING_QUOTES_KEY).catch(() => {});
      }
    }).catch(() => {});

    port.onDisconnect.addListener(() => {
      // Side panel closed
    });
  }
});
