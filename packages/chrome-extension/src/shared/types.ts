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

export interface AgentStatusUpdate {
  type: "agent_status_update";
  agentActive: boolean;
  activeTabId: number | null;
}

export interface BrowserStateRequest {
  type: "browser_state_request";
  requestId: string;
}

export interface BrowserStateResponse {
  type: "browser_state_response";
  requestId: string;
  state: {
    activeTab: { id?: number; url?: string; title?: string } | null;
    tabs: Array<{ id?: number; url?: string; title?: string; active?: boolean }>;
    interactiveElements?: Array<{
      index: number;
      tag: string;
      text?: string;
      ariaLabel?: string;
    }>;
  };
}

// ============================
// Background <-> Content Script
// ============================

export interface ContentReadRequest {
  type: "content_read_request";
  selector?: string;
  maxLength?: number;
  includeInteractiveElements?: boolean;
  mode?: "markdown" | "accessibility" | "both";
}

export interface InteractiveElementSummary {
  index: number;
  tag: string;
  role?: string;
  text?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  href?: string;
  ariaLabel?: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ContentReadResponse {
  type: "content_read_response";
  markdown: string;
  title: string;
  url: string;
  interactiveElements?: InteractiveElementSummary[];
  accessibilityTree?: string;
}

export interface ContentRefreshElementsRequest {
  type: "content_refresh_elements";
}

export interface ContentRefreshElementsResponse {
  type: "content_refresh_elements_response";
  interactiveElements: InteractiveElementSummary[];
}

export interface ContentAnnotateScreenshotRequest {
  type: "content_annotate_screenshot_request";
  enabled: boolean;
}

export interface ContentClickRequest {
  type: "content_click_request";
  index?: number;
  selector?: string;
  x?: number;
  y?: number;
}

export interface ContentTypeRequest {
  type: "content_type_request";
  index?: number;
  selector?: string;
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
  index?: number;
  selector?: string;
  value: string;
}

export interface AgentStateSyncRequest {
  type: "agent_state_sync";
  agentActive: boolean;
  activeTabId: number | null;
  lastHeartbeat: number;
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

export interface MainWorldExecuteRequest {
  type: "main_world_execute_request";
  code: string;
}

export interface MainWorldStatusRequest {
  type: "main_world_status_request";
}

export interface MainWorldStopRequest {
  type: "main_world_stop_request";
}

// Union types
export type BackgroundToContentMessage =
  | ContentReadRequest
  | ContentRefreshElementsRequest
  | ContentAnnotateScreenshotRequest
  | ContentClickRequest
  | ContentTypeRequest
  | ContentScrollRequest
  | ContentSelectRequest
  | ContentWaitRequest
  | AgentStateSyncRequest;

export type ContentToBackgroundMessage =
  | ContentReadResponse
  | ContentRefreshElementsResponse
  | ContentActionResponse
  | ContentSelectionQuote
  | ContentImageQuote;

export type SidePanelToBackgroundMessage =
  | BrowserToolRequest
  | TabGroupUpdate
  | NotificationRequest
  | AgentStatusUpdate
  | BrowserStateRequest
  | MainWorldExecuteRequest
  | MainWorldStatusRequest
  | MainWorldStopRequest;

export type BackgroundToSidePanelMessage =
  | BrowserToolResponse
  | TabGroupResult
  | QuoteToChatMessage
  | BrowserStateResponse;

// All internal messages
export type InternalMessage =
  | BackgroundToContentMessage
  | ContentToBackgroundMessage
  | SidePanelToBackgroundMessage
  | BackgroundToSidePanelMessage;
