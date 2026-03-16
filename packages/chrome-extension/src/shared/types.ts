// Internal extension message types
// Messages between background <-> content script <-> side panel

import type { ChatAttachment } from "@anthropic-ai/acp-browser-shared";

// ============================
// Background <-> Side Panel
// ============================

export interface BrowserToolRequest {
  type: "browser_tool_request";
  callId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface BrowserToolResponse {
  type: "browser_tool_response";
  callId: string;
  result?: unknown;
  error?: string;
}

export interface QuoteToChatMessage {
  type: "quote_to_chat";
  attachment: ChatAttachment;
}

export interface TabGroupUpdate {
  type: "tab_group_update";
  action: "create" | "add" | "remove" | "get";
  tabIds?: number[];
  groupId?: number;
  color?: chrome.tabGroups.ColorEnum;
}

export interface TabGroupResult {
  type: "tab_group_result";
  groupId?: number;
  tabIds?: number[];
  error?: string;
}

export interface NotificationRequest {
  type: "notification_request";
  notificationId?: string;
  title: string;
  message: string;
  priority?: "low" | "normal" | "high";
  action?: "open_sidepanel" | "focus_tab";
  actionTabId?: number;
}

// ============================
// Background <-> Content Script
// ============================

export interface ContentReadRequest {
  type: "content_read_request";
  selector?: string;
  maxLength?: number;
}

export interface ContentReadResponse {
  type: "content_read_response";
  markdown: string;
  title: string;
  url: string;
}

export interface ContentClickRequest {
  type: "content_click_request";
  selector?: string;
  x?: number;
  y?: number;
}

export interface ContentTypeRequest {
  type: "content_type_request";
  selector: string;
  text: string;
  clearFirst: boolean;
}

export interface ContentScrollRequest {
  type: "content_scroll_request";
  direction: "up" | "down" | "left" | "right";
  amount: number;
}

export interface ContentSelectRequest {
  type: "content_select_request";
  selector: string;
  value: string;
}

export interface ContentWaitRequest {
  type: "content_wait_request";
  selector: string;
  timeout: number;
  condition: "visible" | "hidden" | "attached" | "loaded";
}

export interface ContentActionResponse {
  type: "content_action_response";
  success: boolean;
  error?: string;
  data?: unknown;
}

export interface ContentSelectionQuote {
  type: "content_selection_quote";
  text: string;
  url: string;
  title: string;
}

export interface ContentImageQuote {
  type: "content_image_quote";
  src: string;
  alt: string;
  url: string;
  title: string;
}

// Union types
export type BackgroundToContentMessage =
  | ContentReadRequest
  | ContentClickRequest
  | ContentTypeRequest
  | ContentScrollRequest
  | ContentSelectRequest
  | ContentWaitRequest;

export type ContentToBackgroundMessage =
  | ContentReadResponse
  | ContentActionResponse
  | ContentSelectionQuote
  | ContentImageQuote;

export type SidePanelToBackgroundMessage =
  | BrowserToolRequest
  | TabGroupUpdate
  | NotificationRequest;

export type BackgroundToSidePanelMessage =
  | BrowserToolResponse
  | TabGroupResult
  | QuoteToChatMessage;

// All internal messages
export type InternalMessage =
  | BackgroundToContentMessage
  | ContentToBackgroundMessage
  | SidePanelToBackgroundMessage
  | BackgroundToSidePanelMessage;
