import { useEffect, useState, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTabGroupsReturn {
  groupId: number | null;
  tabIds: number[];
  createGroup: (initialTabIds?: number[]) => Promise<number | null>;
  addTab: (tabId: number) => Promise<void>;
  removeTab: (tabId: number) => Promise<void>;
  dissolveGroup: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GROUP_TITLE = "Agent Workspace";
const GROUP_COLOR: chrome.tabGroups.ColorEnum = "blue";
const STORAGE_KEY = "acp:tabGroupId";

// ---------------------------------------------------------------------------
// Persistence: remember group ID across side panel reloads
// ---------------------------------------------------------------------------

async function loadGroupId(): Promise<number | null> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY);
    const id = result[STORAGE_KEY] as number | undefined;
    if (id == null) return null;
    // Verify the group still exists
    try {
      await chrome.tabGroups.get(id);
      return id;
    } catch {
      await chrome.storage.session.remove(STORAGE_KEY);
      return null;
    }
  } catch {
    return null;
  }
}

async function saveGroupId(id: number | null): Promise<void> {
  if (id == null) {
    await chrome.storage.session.remove(STORAGE_KEY).catch(() => {});
  } else {
    await chrome.storage.session.set({ [STORAGE_KEY]: id }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTabGroups(): UseTabGroupsReturn {
  const [groupId, setGroupId] = useState<number | null>(null);
  const [tabIds, setTabIds] = useState<number[]>([]);
  const groupIdRef = useRef<number | null>(null);

  // Keep ref in sync for event handlers
  useEffect(() => {
    groupIdRef.current = groupId;
  }, [groupId]);

  // ----------------------------------
  // Refresh tab list for current group
  // ----------------------------------
  const refreshTabs = useCallback(async (gid: number) => {
    try {
      const tabs = await chrome.tabs.query({ groupId: gid });
      setTabIds(tabs.map((t) => t.id!).filter((id) => id != null));
    } catch {
      setTabIds([]);
    }
  }, []);

  // ----------------------------------
  // Init: restore group from session storage
  // ----------------------------------
  useEffect(() => {
    loadGroupId().then((id) => {
      if (id != null) {
        setGroupId(id);
        refreshTabs(id);
      }
    });
  }, [refreshTabs]);

  // ----------------------------------
  // Listen for tab events
  // ----------------------------------
  useEffect(() => {
    const onTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      const gid = groupIdRef.current;
      if (gid == null) return;
      if (changeInfo.groupId === gid) {
        setTabIds((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
      } else if (changeInfo.groupId != null && changeInfo.groupId !== gid) {
        // Tab moved out of our group
        setTabIds((prev) => prev.filter((id) => id !== tabId));
      }
    };

    const onTabRemoved = (tabId: number) => {
      setTabIds((prev) => {
        const next = prev.filter((id) => id !== tabId);
        // If group is now empty, dissolve it
        if (next.length === 0 && groupIdRef.current != null) {
          setGroupId(null);
          saveGroupId(null);
        }
        return next;
      });
    };

    // Auto-add tabs created by agent (via chrome.tabs.create from content/background scripts)
    const onTabCreated = (tab: chrome.tabs.Tab) => {
      const gid = groupIdRef.current;
      if (gid == null) return;
      // If the tab was opened from a tab already in our group (opener), auto-add it
      if (tab.openerTabId != null && tab.id != null) {
        chrome.tabs.get(tab.openerTabId).then((openerTab) => {
          if (openerTab.groupId === gid && tab.id != null) {
            chrome.tabs.group({ tabIds: tab.id, groupId: gid }).then(() => {
              setTabIds((prev) =>
                prev.includes(tab.id!) ? prev : [...prev, tab.id!],
              );
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    };

    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.tabs.onRemoved.addListener(onTabRemoved);
    chrome.tabs.onCreated.addListener(onTabCreated);

    return () => {
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      chrome.tabs.onRemoved.removeListener(onTabRemoved);
      chrome.tabs.onCreated.removeListener(onTabCreated);
    };
  }, []);

  // ----------------------------------
  // Create group
  // ----------------------------------
  const createGroup = useCallback(
    async (initialTabIds?: number[]): Promise<number | null> => {
      try {
        const ids = initialTabIds ?? [];

        if (ids.length === 0) {
          // Create a new empty tab to seed the group
          const tab = await chrome.tabs.create({ active: false });
          if (tab.id != null) ids.push(tab.id);
        }

        if (ids.length === 0) return null;

        const gid = await chrome.tabs.group({ tabIds: ids });
        await chrome.tabGroups.update(gid, {
          title: GROUP_TITLE,
          color: GROUP_COLOR,
          collapsed: false,
        });

        setGroupId(gid);
        setTabIds(ids);
        await saveGroupId(gid);
        return gid;
      } catch {
        return null;
      }
    },
    [],
  );

  // ----------------------------------
  // Add tab to group
  // ----------------------------------
  const addTab = useCallback(
    async (tabId: number) => {
      let gid = groupIdRef.current;
      if (gid == null) {
        gid = await createGroup([tabId]);
        return;
      }
      try {
        await chrome.tabs.group({ tabIds: tabId, groupId: gid });
        setTabIds((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
      } catch {
        // Group may have been dissolved externally
        const newGid = await createGroup([tabId]);
        if (newGid == null) return;
      }
    },
    [createGroup],
  );

  // ----------------------------------
  // Remove tab from group
  // ----------------------------------
  const removeTab = useCallback(async (tabId: number) => {
    try {
      await chrome.tabs.ungroup(tabId);
    } catch {
      // Tab may already be ungrouped or closed
    }
    setTabIds((prev) => {
      const next = prev.filter((id) => id !== tabId);
      if (next.length === 0 && groupIdRef.current != null) {
        setGroupId(null);
        saveGroupId(null);
      }
      return next;
    });
  }, []);

  // ----------------------------------
  // Dissolve entire group
  // ----------------------------------
  const dissolveGroup = useCallback(async () => {
    const gid = groupIdRef.current;
    if (gid == null) return;
    try {
      const tabs = await chrome.tabs.query({ groupId: gid });
      const ids = tabs.map((t) => t.id!).filter((id) => id != null);
      if (ids.length > 0) {
        await chrome.tabs.ungroup(ids);
      }
    } catch {
      // Best effort
    }
    setGroupId(null);
    setTabIds([]);
    await saveGroupId(null);
  }, []);

  return {
    groupId,
    tabIds,
    createGroup,
    addTab,
    removeTab,
    dissolveGroup,
  };
}
