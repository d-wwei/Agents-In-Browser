/**
 * Content script entry point.
 * Dynamically injected by the background service worker.
 * Handles page reading, DOM interactions, and selection capture.
 */

import { readPageAsMarkdown } from "./pageReader";
import { click, type, scroll, select, waitForElement } from "./domInteraction";
import { initSelectionCapture } from "./selectionCapture";
import {
  getViewportInfo,
  scrollToPosition,
  getElementBounds,
  annotateInteractiveElements,
  clearInteractiveElementAnnotations,
} from "./screenshotCapture";
import { buildInteractiveElementMap, clearElementMap } from "./elementIndexer";
import { buildAccessibilityTree } from "./accessibilityTree";
import { showAgentOverlay, hideAgentOverlay, showActionFeedback, highlightElement } from "./agentOverlay";
import { getElementByIndex } from "./elementIndexer";
import type {
  BackgroundToContentMessage,
  ContentReadResponse,
  ContentActionResponse,
  ContentRefreshElementsResponse,
} from "../shared/types";

// Prevent double-initialization
if (!(window as unknown as Record<string, boolean>).__acpContentScriptLoaded) {
  (window as unknown as Record<string, boolean>).__acpContentScriptLoaded = true;

  const emitMainWorldStatus = (status: { agentActive: boolean; activeTabId: number | null }) => {
    window.postMessage(
      {
        source: "acp-content-bridge",
        type: "status_update",
        status,
      },
      "*",
    );
  };

  // Initialize selection capture (floating button)
  initSelectionCapture();

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(
    (
      message: BackgroundToContentMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: ContentReadResponse | ContentActionResponse | ContentRefreshElementsResponse) => void,
    ) => {
      handleMessage(message)
        .then(sendResponse)
        .catch((err) => {
          sendResponse({
            type: "content_action_response",
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      // Return true to indicate async response
      return true;
    },
  );

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!changes.acpAgentState) return;

    const next = changes.acpAgentState.newValue as
      | { agentActive?: boolean; activeTabId?: number | null }
      | undefined;
    if (!next) return;

    const currentTabId = (window as unknown as Record<string, number | undefined>).__acpCurrentTabId;
    if (!next.agentActive || next.activeTabId !== currentTabId) {
      hideAgentOverlay();
      clearElementMap();
    } else {
      showAgentOverlay();
    }
    emitMainWorldStatus({
      agentActive: next.agentActive === true,
      activeTabId: typeof next.activeTabId === "number" ? next.activeTabId : null,
    });
  });

  window.addEventListener("beforeunload", () => {
    hideAgentOverlay();
    clearElementMap();
  });

  window.addEventListener("popstate", () => {
    hideAgentOverlay();
    clearElementMap();
  });

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as {
      source?: string;
      type?: string;
      action?: "execute" | "stop" | "status";
      requestId?: string;
      payload?: { code?: string };
    };
    if (!data || data.source !== "acp-main-world" || data.type !== "request" || !data.requestId) return;

    const respond = (success: boolean, result?: unknown, error?: string) => {
      window.postMessage(
        {
          source: "acp-content-bridge",
          type: "response",
          requestId: data.requestId,
          success,
          result,
          error,
        },
        "*",
      );
    };

    const sendBackgroundRequest = (message: { type: string; [key: string]: unknown }) => {
      chrome.runtime.sendMessage(message, (response: unknown) => {
        if (chrome.runtime.lastError) {
          respond(false, undefined, chrome.runtime.lastError.message);
          return;
        }
        const typed = response as { ok?: boolean; error?: string; result?: unknown; status?: unknown } | undefined;
        if (!typed) {
          respond(false, undefined, "No response from background");
          return;
        }
        if (typed.ok === false || typed.error) {
          respond(false, undefined, typed.error || "Bridge request failed");
          return;
        }
        respond(true, typed.result ?? typed.status ?? typed);
      });
    };

    switch (data.action) {
      case "execute":
        sendBackgroundRequest({ type: "main_world_execute_request", code: data.payload?.code || "" });
        break;
      case "stop":
        sendBackgroundRequest({ type: "main_world_stop_request" });
        break;
      case "status":
        sendBackgroundRequest({ type: "main_world_status_request" });
        break;
      default:
        respond(false, undefined, `Unsupported action: ${String(data.action)}`);
    }
  });
}

async function handleMessage(
  message: BackgroundToContentMessage,
): Promise<ContentReadResponse | ContentActionResponse | ContentRefreshElementsResponse> {
  const resolveTarget = (payload: { index?: number; selector?: string; x?: number; y?: number }): Element | null => {
    try {
      if (typeof payload.index === "number") return getElementByIndex(payload.index);
      if (payload.selector) return document.querySelector(payload.selector);
      if (payload.x !== undefined && payload.y !== undefined) {
        return document.elementFromPoint(payload.x, payload.y);
      }
      return null;
    } catch {
      return null;
    }
  };

  switch (message.type) {
    case "content_read_request": {
      const mode = message.mode || "markdown";
      const result = readPageAsMarkdown({
        selector: message.selector,
        maxLength: message.maxLength,
        includeInteractiveElements: message.includeInteractiveElements,
      });
      const root = message.selector ? document.querySelector(message.selector) || undefined : undefined;
      const accessibilityTree = mode === "accessibility" || mode === "both"
        ? buildAccessibilityTree(root)
        : undefined;

      const markdown =
        mode === "accessibility"
          ? accessibilityTree || "[No accessibility tree]"
          : mode === "both"
            ? `${result.markdown}\n\n## Accessibility Tree\n${accessibilityTree || "[No accessibility tree]"}`
            : result.markdown;
      return {
        type: "content_read_response",
        markdown,
        title: result.title,
        url: result.url,
        interactiveElements: result.interactiveElements,
        accessibilityTree,
      };
    }

    case "content_refresh_elements": {
      const interactiveElements = buildInteractiveElementMap();
      return {
        type: "content_refresh_elements_response",
        interactiveElements,
      };
    }

    case "content_annotate_screenshot_request": {
      if (message.enabled) {
        const count = annotateInteractiveElements();
        return {
          type: "content_action_response",
          success: true,
          data: { annotated: true, count },
        };
      }
      clearInteractiveElementAnnotations();
      return {
        type: "content_action_response",
        success: true,
        data: { annotated: false },
      };
    }

    case "agent_state_sync": {
      const activeTabId = message.activeTabId;
      const currentTabId = (window as unknown as Record<string, number | undefined>).__acpCurrentTabId;
      if (!message.agentActive || activeTabId !== currentTabId) {
        hideAgentOverlay();
        clearElementMap();
      } else {
        showAgentOverlay();
      }
      window.postMessage(
        {
          source: "acp-content-bridge",
          type: "status_update",
          status: {
            agentActive: message.agentActive,
            activeTabId: message.activeTabId,
          },
        },
        "*",
      );
      return {
        type: "content_action_response",
        success: true,
      };
    }

    case "content_click_request": {
      const target = resolveTarget(message);
      if (target) {
        highlightElement(target, typeof message.index === "number" ? `[${message.index}]` : undefined, 2000, "#2563eb");
      }
      showActionFeedback("Clicking", typeof message.index === "number" ? `[${message.index}]` : message.selector || "target");
      const result = click({
        index: message.index,
        selector: message.selector,
        x: message.x,
        y: message.y,
      });
      return {
        type: "content_action_response",
        success: true,
        data: result,
      };
    }

    case "content_type_request": {
      const target = resolveTarget(message);
      if (target) {
        highlightElement(target, typeof message.index === "number" ? `[${message.index}]` : undefined, 2000, "#2563eb");
      }
      showActionFeedback("Typing", typeof message.index === "number" ? `[${message.index}]` : message.selector || "target");
      const result = type({
        index: message.index,
        selector: message.selector,
        text: message.text,
        clearFirst: message.clearFirst,
      });
      return {
        type: "content_action_response",
        success: true,
        data: result,
      };
    }

    case "content_scroll_request": {
      showActionFeedback("Scrolling", message.direction);
      const result = scroll({
        direction: message.direction,
        amount: message.amount,
      });
      return {
        type: "content_action_response",
        success: true,
        data: result,
      };
    }

    case "content_select_request": {
      const target = resolveTarget(message);
      if (target) {
        highlightElement(target, typeof message.index === "number" ? `[${message.index}]` : undefined, 2000, "#2563eb");
      }
      showActionFeedback("Selecting", typeof message.index === "number" ? `[${message.index}]` : message.selector || "target");
      const result = select({
        index: message.index,
        selector: message.selector,
        value: message.value,
      });
      return {
        type: "content_action_response",
        success: true,
        data: result,
      };
    }

    case "content_wait_request": {
      const result = await waitForElement({
        selector: message.selector,
        timeout: message.timeout,
        condition: message.condition,
      });
      return {
        type: "content_action_response",
        success: result.found,
        data: result,
        error: result.found ? undefined : `Timeout waiting for "${message.selector}" (${message.condition})`,
      };
    }

    default: {
      return {
        type: "content_action_response",
        success: false,
        error: `Unknown message type: ${(message as { type: string }).type}`,
      };
    }
  }
}

// Expose viewport helpers for screenshot-related executeScript calls
(window as unknown as Record<string, unknown>).__acpGetViewportInfo = getViewportInfo;
(window as unknown as Record<string, unknown>).__acpScrollToPosition = scrollToPosition;
(window as unknown as Record<string, unknown>).__acpGetElementBounds = getElementBounds;
