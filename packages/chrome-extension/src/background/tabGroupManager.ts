/**
 * Tab group management for agent workspace.
 * Creates and manages an "Agent Workspace" tab group.
 */

import { AGENT_TAB_GROUP_TITLE, AGENT_TAB_GROUP_COLOR } from "../shared/constants";

let activeGroupId: number | null = null;

/**
 * Create a new "Agent Workspace" tab group or return the existing one.
 */
export async function getOrCreateGroup(
  color?: chrome.tabGroups.ColorEnum,
): Promise<number> {
  // Check if existing group is still valid
  if (activeGroupId !== null) {
    try {
      const group = await chrome.tabGroups.get(activeGroupId);
      if (group) return activeGroupId;
    } catch {
      // Group no longer exists
      activeGroupId = null;
    }
  }

  // Look for an existing group with our title
  const allGroups = await chrome.tabGroups.query({ title: AGENT_TAB_GROUP_TITLE });
  if (allGroups.length > 0) {
    activeGroupId = allGroups[0].id;
    return activeGroupId;
  }

  // Create a new tab as anchor for the group
  const tab = await chrome.tabs.create({ active: false, url: "about:blank" });
  if (!tab.id) {
    throw new Error("Failed to create anchor tab for group");
  }

  const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
  await chrome.tabGroups.update(groupId, {
    title: AGENT_TAB_GROUP_TITLE,
    color: color || AGENT_TAB_GROUP_COLOR,
    collapsed: false,
  });

  // Close the blank anchor tab
  await chrome.tabs.remove(tab.id);

  activeGroupId = groupId;
  return groupId;
}

/**
 * Add tabs to the agent workspace group.
 */
export async function addTabsToGroup(tabIds: number[]): Promise<number> {
  if (tabIds.length === 0) return activeGroupId ?? -1;

  const groupId = await getOrCreateGroup();

  await chrome.tabs.group({ tabIds, groupId });
  return groupId;
}

/**
 * Remove tabs from the agent workspace group.
 */
export async function removeTabsFromGroup(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) return;

  try {
    await chrome.tabs.ungroup(tabIds);
  } catch {
    // Tabs may already be ungrouped or closed
  }
}

/**
 * Get all tab IDs currently in the agent workspace group.
 */
export async function getGroupTabIds(): Promise<number[]> {
  if (activeGroupId === null) {
    // Try to find existing group
    const groups = await chrome.tabGroups.query({ title: AGENT_TAB_GROUP_TITLE });
    if (groups.length === 0) return [];
    activeGroupId = groups[0].id;
  }

  const tabs = await chrome.tabs.query({ groupId: activeGroupId });
  return tabs.map((t) => t.id!).filter((id) => id !== undefined);
}

/**
 * Update the group color.
 */
export async function updateGroupColor(color: chrome.tabGroups.ColorEnum): Promise<void> {
  if (activeGroupId === null) return;
  try {
    await chrome.tabGroups.update(activeGroupId, { color });
  } catch {
    // Group may not exist
  }
}

/**
 * Handle a tab being created - auto-add to group if opened by agent navigation.
 * Called from background script when a new tab is created via browser_navigate.
 */
export async function autoAddTabToGroup(tabId: number): Promise<void> {
  if (activeGroupId === null) return;
  try {
    await chrome.tabs.group({ tabIds: [tabId], groupId: activeGroupId });
  } catch {
    // Group may have been removed
  }
}

/**
 * Clean up: remove the group reference (not the tabs themselves).
 */
export function clearGroupReference(): void {
  activeGroupId = null;
}

/**
 * Handle tab group messages from side panel.
 */
export async function handleTabGroupMessage(message: {
  action: "create" | "add" | "remove" | "get";
  tabIds?: number[];
  groupId?: number;
  color?: chrome.tabGroups.ColorEnum;
}): Promise<{ groupId?: number; tabIds?: number[]; error?: string }> {
  try {
    switch (message.action) {
      case "create": {
        const groupId = await getOrCreateGroup(message.color);
        return { groupId };
      }
      case "add": {
        if (!message.tabIds || message.tabIds.length === 0) {
          return { error: "No tab IDs provided" };
        }
        const groupId = await addTabsToGroup(message.tabIds);
        return { groupId };
      }
      case "remove": {
        if (!message.tabIds || message.tabIds.length === 0) {
          return { error: "No tab IDs provided" };
        }
        await removeTabsFromGroup(message.tabIds);
        return {};
      }
      case "get": {
        const tabIds = await getGroupTabIds();
        return { groupId: activeGroupId ?? undefined, tabIds };
      }
      default:
        return { error: `Unknown action: ${message.action}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
