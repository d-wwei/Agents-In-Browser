/**
 * Content script entry point.
 * Dynamically injected by the background service worker.
 * Handles page reading, DOM interactions, and selection capture.
 */

import { readPageAsMarkdown } from "./pageReader";
import { click, type, scroll, select, waitForElement } from "./domInteraction";
import { initSelectionCapture } from "./selectionCapture";
import { getViewportInfo, scrollToPosition, getElementBounds } from "./screenshotCapture";
import type {
  BackgroundToContentMessage,
  ContentReadResponse,
  ContentActionResponse,
} from "../shared/types";

// Prevent double-initialization
if (!(window as unknown as Record<string, boolean>).__acpContentScriptLoaded) {
  (window as unknown as Record<string, boolean>).__acpContentScriptLoaded = true;

  // Initialize selection capture (floating button)
  initSelectionCapture();

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(
    (
      message: BackgroundToContentMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: ContentReadResponse | ContentActionResponse) => void,
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
}

async function handleMessage(
  message: BackgroundToContentMessage,
): Promise<ContentReadResponse | ContentActionResponse> {
  switch (message.type) {
    case "content_read_request": {
      const result = readPageAsMarkdown({
        selector: message.selector,
        maxLength: message.maxLength,
      });
      return {
        type: "content_read_response",
        markdown: result.markdown,
        title: result.title,
        url: result.url,
      };
    }

    case "content_click_request": {
      const result = click({
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
      const result = type({
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
      const result = select({
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
