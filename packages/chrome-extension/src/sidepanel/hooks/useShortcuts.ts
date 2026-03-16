import { useEffect, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Shortcut {
  id: string;
  command: string; // e.g. "/summarize"
  label: string;
  template: string; // Supports {{selection}}, {{page_content}}, {{page_url}}, {{page_title}}
  isPreset: boolean;
}

export interface UseShortcutsReturn {
  shortcuts: Shortcut[];
  addShortcut: (shortcut: Omit<Shortcut, "id" | "isPreset">) => Promise<void>;
  updateShortcut: (id: string, updates: Partial<Omit<Shortcut, "id" | "isPreset">>) => Promise<void>;
  removeShortcut: (id: string) => Promise<void>;
  resolveTemplate: (template: string, context: ShortcutContext) => string;
  getByCommand: (command: string) => Shortcut | undefined;
}

export interface ShortcutContext {
  selection?: string;
  pageContent?: string;
  pageUrl?: string;
  pageTitle?: string;
}

// ---------------------------------------------------------------------------
// Preset shortcuts
// ---------------------------------------------------------------------------

const PRESET_SHORTCUTS: Shortcut[] = [
  {
    id: "preset-summarize",
    command: "/summarize",
    label: "Summarize page",
    template:
      "Please summarize the following page content:\n\nURL: {{page_url}}\nTitle: {{page_title}}\n\n{{page_content}}",
    isPreset: true,
  },
  {
    id: "preset-translate",
    command: "/translate",
    label: "Translate selection",
    template:
      "Please translate the following text to Chinese (if it's Chinese, translate to English):\n\n{{selection}}",
    isPreset: true,
  },
  {
    id: "preset-explain",
    command: "/explain",
    label: "Explain selection",
    template:
      "Please explain the following in simple terms:\n\n{{selection}}",
    isPreset: true,
  },
  {
    id: "preset-review",
    command: "/review",
    label: "Review code",
    template:
      "Please review the following code for potential issues, improvements, and best practices:\n\n{{selection}}",
    isPreset: true,
  },
];

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "acp:shortcuts";

async function loadCustomShortcuts(): Promise<Shortcut[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as Shortcut[]) ?? [];
  } catch {
    return [];
  }
}

async function saveCustomShortcuts(shortcuts: Shortcut[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: shortcuts });
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

function resolveTemplate(template: string, context: ShortcutContext): string {
  return template
    .replace(/\{\{selection\}\}/g, context.selection ?? "")
    .replace(/\{\{page_content\}\}/g, context.pageContent ?? "")
    .replace(/\{\{page_url\}\}/g, context.pageUrl ?? "")
    .replace(/\{\{page_title\}\}/g, context.pageTitle ?? "");
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShortcuts(): UseShortcutsReturn {
  const [customShortcuts, setCustomShortcuts] = useState<Shortcut[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load custom shortcuts on mount
  useEffect(() => {
    loadCustomShortcuts().then((shortcuts) => {
      setCustomShortcuts(shortcuts);
      setLoaded(true);
    });
  }, []);

  const allShortcuts = [...PRESET_SHORTCUTS, ...customShortcuts];

  const addShortcut = useCallback(
    async (shortcut: Omit<Shortcut, "id" | "isPreset">) => {
      // Ensure command starts with /
      const command = shortcut.command.startsWith("/")
        ? shortcut.command
        : `/${shortcut.command}`;

      // Check for duplicate command
      const existing = [...PRESET_SHORTCUTS, ...customShortcuts].find(
        (s) => s.command === command,
      );
      if (existing) {
        throw new Error(`Shortcut "${command}" already exists`);
      }

      const newShortcut: Shortcut = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        command,
        label: shortcut.label,
        template: shortcut.template,
        isPreset: false,
      };

      const updated = [...customShortcuts, newShortcut];
      setCustomShortcuts(updated);
      await saveCustomShortcuts(updated);
    },
    [customShortcuts],
  );

  const updateShortcut = useCallback(
    async (id: string, updates: Partial<Omit<Shortcut, "id" | "isPreset">>) => {
      // Can only update custom shortcuts
      const idx = customShortcuts.findIndex((s) => s.id === id);
      if (idx === -1) return;

      const updated = [...customShortcuts];
      updated[idx] = { ...updated[idx], ...updates };

      // Validate command format
      if (updates.command) {
        updated[idx].command = updates.command.startsWith("/")
          ? updates.command
          : `/${updates.command}`;
      }

      setCustomShortcuts(updated);
      await saveCustomShortcuts(updated);
    },
    [customShortcuts],
  );

  const removeShortcut = useCallback(
    async (id: string) => {
      // Can only remove custom shortcuts
      const updated = customShortcuts.filter((s) => s.id !== id);
      if (updated.length === customShortcuts.length) return;
      setCustomShortcuts(updated);
      await saveCustomShortcuts(updated);
    },
    [customShortcuts],
  );

  const getByCommand = useCallback(
    (command: string): Shortcut | undefined => {
      const normalized = command.startsWith("/") ? command : `/${command}`;
      return allShortcuts.find((s) => s.command === normalized);
    },
    [loaded, customShortcuts],
  );

  return {
    shortcuts: allShortcuts,
    addShortcut,
    updateShortcut,
    removeShortcut,
    resolveTemplate,
    getByCommand,
  };
}
