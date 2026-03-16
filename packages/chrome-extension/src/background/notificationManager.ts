/**
 * Chrome notification management.
 * Creates notifications for task completion, permission requests, and errors.
 */

interface NotificationAction {
  type: "open_sidepanel" | "focus_tab";
  tabId?: number;
}

// Map of notification ID -> action to perform on click
const pendingActions = new Map<string, NotificationAction>();

// Counter for generating unique notification IDs
let notificationCounter = 0;

/**
 * Create a Chrome notification.
 */
export function createNotification(params: {
  id?: string;
  title: string;
  message: string;
  priority?: "low" | "normal" | "high";
  action?: "open_sidepanel" | "focus_tab";
  actionTabId?: number;
}): string {
  const id = params.id || `acp-notification-${++notificationCounter}-${Date.now()}`;

  const priorityMap: Record<string, number> = {
    low: 0,
    normal: 1,
    high: 2,
  };

  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: params.title,
    message: params.message,
    priority: priorityMap[params.priority || "normal"] ?? 1,
    requireInteraction: params.priority === "high",
  });

  if (params.action) {
    pendingActions.set(id, {
      type: params.action,
      tabId: params.actionTabId,
    });

    // Clean up after 5 minutes
    setTimeout(() => {
      pendingActions.delete(id);
    }, 5 * 60 * 1000);
  }

  return id;
}

/**
 * Handle notification click.
 */
export function handleNotificationClick(notificationId: string): void {
  const action = pendingActions.get(notificationId);
  if (!action) return;

  pendingActions.delete(notificationId);

  switch (action.type) {
    case "open_sidepanel":
      // Open side panel in current window
      chrome.windows.getCurrent({}, (window) => {
        if (window.id !== undefined) {
          chrome.sidePanel
            .open({ windowId: window.id })
            .catch(() => { /* side panel may already be open */ });
        }
      });
      break;

    case "focus_tab":
      if (action.tabId !== undefined) {
        chrome.tabs.update(action.tabId, { active: true }).catch(() => {
          // Tab may no longer exist
        });
        // Also focus the window containing the tab
        chrome.tabs.get(action.tabId, (tab) => {
          if (tab.windowId !== undefined) {
            chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
          }
        });
      }
      break;
  }

  // Clear the notification
  chrome.notifications.clear(notificationId);
}

/**
 * Notify task completion.
 */
export function notifyTaskComplete(summary: string): string {
  return createNotification({
    title: "ACP - Task Complete",
    message: summary,
    priority: "normal",
    action: "open_sidepanel",
  });
}

/**
 * Notify permission request.
 */
export function notifyPermissionRequest(action: string, url?: string): string {
  return createNotification({
    title: "ACP - Permission Required",
    message: `Agent requests: ${action}${url ? ` on ${url}` : ""}`,
    priority: "high",
    action: "open_sidepanel",
  });
}

/**
 * Notify error.
 */
export function notifyError(message: string): string {
  return createNotification({
    title: "ACP - Error",
    message,
    priority: "normal",
    action: "open_sidepanel",
  });
}

/**
 * Initialize notification listeners.
 */
export function initNotificationListeners(): void {
  chrome.notifications.onClicked.addListener(handleNotificationClick);

  chrome.notifications.onClosed.addListener((notificationId) => {
    pendingActions.delete(notificationId);
  });
}
