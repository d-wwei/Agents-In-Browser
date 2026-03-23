/**
 * Context menu management.
 * Registers "Quote to Chat" context menus for selection, image, link, and page.
 */

import {
  CONTEXT_MENU_QUOTE_SELECTION,
  CONTEXT_MENU_QUOTE_IMAGE,
  CONTEXT_MENU_QUOTE_LINK,
  CONTEXT_MENU_QUOTE_PAGE,
} from "../shared/constants";
import type { QuoteToChatMessage } from "../shared/types";
import { generateId } from "../shared/utils";
import { REFERENCE_PREVIEW_MAX_CHARS } from "@anthropic-ai/agents-in-browser-shared";

/**
 * Register all context menu items. Call on chrome.runtime.onInstalled.
 */
export function registerContextMenus(): void {
  // Remove existing menus first to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_QUOTE_SELECTION,
      title: "引用到聊天 / Quote to Chat",
      contexts: ["selection"],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_QUOTE_IMAGE,
      title: "引用图片到聊天 / Quote Image",
      contexts: ["image"],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_QUOTE_LINK,
      title: "引用链接到聊天 / Quote Link",
      contexts: ["link"],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_QUOTE_PAGE,
      title: "引用页面到聊天 / Quote Page",
      contexts: ["page"],
    });
  });
}

/**
 * Handle context menu item clicks.
 * Extracts content and sends a QuoteToChatMessage to the side panel.
 */
export function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): void {
  const url = tab?.url || info.pageUrl || "";
  const title = tab?.title || "";

  let message: QuoteToChatMessage | null = null;

  switch (info.menuItemId) {
    case CONTEXT_MENU_QUOTE_SELECTION: {
      const text = info.selectionText || "";
      if (!text) return;
      message = {
        type: "quote_to_chat",
        attachment: {
          id: generateId(),
          type: "text",
          content: text,
          source: { url, title },
          preview: text.slice(0, REFERENCE_PREVIEW_MAX_CHARS),
        },
      };
      break;
    }

    case CONTEXT_MENU_QUOTE_IMAGE: {
      const src = info.srcUrl || "";
      if (!src) return;
      message = {
        type: "quote_to_chat",
        attachment: {
          id: generateId(),
          type: "image",
          content: src,
          mimeType: guessMimeType(src),
          source: { url, title },
          preview: `[Image: ${src.split("/").pop()?.slice(0, 60) || "image"}]`,
        },
      };
      break;
    }

    case CONTEXT_MENU_QUOTE_LINK: {
      const linkUrl = info.linkUrl || "";
      const linkText = info.selectionText || linkUrl;
      if (!linkUrl) return;
      message = {
        type: "quote_to_chat",
        attachment: {
          id: generateId(),
          type: "text",
          content: `[${linkText}](${linkUrl})`,
          source: { url, title },
          preview: linkText.slice(0, REFERENCE_PREVIEW_MAX_CHARS),
        },
      };
      break;
    }

    case CONTEXT_MENU_QUOTE_PAGE: {
      message = {
        type: "quote_to_chat",
        attachment: {
          id: generateId(),
          type: "page",
          content: url,
          source: { url, title },
          preview: `[Page: ${title || url}]`.slice(0, REFERENCE_PREVIEW_MAX_CHARS),
        },
      };
      break;
    }
  }

  if (message) {
    // Send to side panel (side panel listens for runtime messages)
    chrome.runtime.sendMessage(message).catch(() => {
      // Side panel may not be open; ignore error
    });
  }
}

function guessMimeType(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    default:
      return "image/png";
  }
}
