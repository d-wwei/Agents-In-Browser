import { useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType = "task_complete" | "permission_needed" | "error";

export interface NotificationOptions {
  type: NotificationType;
  title: string;
  message: string;
  /** If provided, clicking the notification opens the side panel on this URL's tab */
  tabId?: number;
}

export interface UseNotificationsReturn {
  notify: (options: NotificationOptions) => void;
}

// ---------------------------------------------------------------------------
// Notification ID prefix for cleanup
// ---------------------------------------------------------------------------

const NOTIFICATION_PREFIX = "acp-";

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

function getIconUrl(type: NotificationType): string {
  // Use extension icons – fallback to a generic icon
  switch (type) {
    case "task_complete":
      return chrome.runtime.getURL("icons/icon128.png");
    case "permission_needed":
      return chrome.runtime.getURL("icons/icon128.png");
    case "error":
      return chrome.runtime.getURL("icons/icon128.png");
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotifications(): UseNotificationsReturn {
  // Register click handler once
  useEffect(() => {
    const handler = (notificationId: string) => {
      if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return;

      // Open side panel when notification is clicked
      // We store tabId in the notification ID as: "acp-{type}-{tabId}-{timestamp}"
      const parts = notificationId.split("-");
      const tabIdStr = parts[2];
      const tabId = tabIdStr ? parseInt(tabIdStr, 10) : NaN;

      if (!isNaN(tabId)) {
        // Focus the tab and open side panel
        chrome.tabs.update(tabId, { active: true }).catch(() => {});
        chrome.sidePanel
          .open({ tabId })
          .catch(() => {
            // sidePanel.open may not be available in all contexts
          });
      } else {
        // Just try to open side panel in current window
        chrome.windows.getCurrent().then((win) => {
          if (win.id != null) {
            chrome.sidePanel.open({ windowId: win.id }).catch(() => {});
          }
        });
      }

      // Clear the notification
      chrome.notifications.clear(notificationId);
    };

    chrome.notifications.onClicked.addListener(handler);
    return () => {
      chrome.notifications.onClicked.removeListener(handler);
    };
  }, []);

  const notify = useCallback((options: NotificationOptions) => {
    const { type, title, message, tabId } = options;

    const notificationId = `${NOTIFICATION_PREFIX}${type}-${tabId ?? "global"}-${Date.now()}`;

    chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl: getIconUrl(type),
      title,
      message,
      priority: type === "permission_needed" ? 2 : type === "error" ? 1 : 0,
      requireInteraction: type === "permission_needed",
    });

    // Auto-clear non-critical notifications after 8 seconds
    if (type !== "permission_needed") {
      setTimeout(() => {
        chrome.notifications.clear(notificationId);
      }, 8_000);
    }
  }, []);

  return { notify };
}
