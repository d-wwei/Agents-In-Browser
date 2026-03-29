import { useState, useEffect, useCallback, useRef } from "react";
import { SYSTEM_COMMANDS, type CommandDefinition } from "@anthropic-ai/agents-in-browser-shared";

interface Shortcut {
  command: string;
  label: string;
  description: string;
  isSystem?: boolean;
  category?: string;
}

const AGENT_SHORTCUTS: Shortcut[] = [
  {
    command: "/summarize",
    label: "Summarize",
    description: "Summarize the current page",
  },
  {
    command: "/explain",
    label: "Explain",
    description: "Explain the selected content",
  },
  {
    command: "/translate",
    label: "Translate",
    description: "Translate to another language",
  },
  {
    command: "/fix",
    label: "Fix",
    description: "Fix grammar or code errors",
  },
  {
    command: "/review",
    label: "Review",
    description: "Review code or text",
  },
  {
    command: "/test",
    label: "Test",
    description: "Generate tests for selected code",
  },
  {
    command: "/screenshot",
    label: "Screenshot",
    description: "Capture and analyze the current page",
  },
  {
    command: "/tabs",
    label: "Tabs",
    description: "List and describe open tabs",
  },
];

const SYSTEM_SHORTCUT_LIST: Shortcut[] = SYSTEM_COMMANDS.map((cmd: CommandDefinition) => ({
  command: cmd.command,
  label: cmd.label,
  description: cmd.args ? `${cmd.description} (${cmd.args})` : cmd.description,
  isSystem: true,
  category: cmd.category,
}));

const ALL_SHORTCUTS: Shortcut[] = [...SYSTEM_SHORTCUT_LIST, ...AGENT_SHORTCUTS];

interface ShortcutTriggerProps {
  filter: string;
  onSelect: (command: string) => void;
  onClose: () => void;
}

function commandPrefixMatch(command: string, query: string): boolean {
  if (!query) return true;
  // Strip leading "/" from command for matching (filter already has "/" stripped)
  const name = command.startsWith("/") ? command.slice(1) : command;
  return name.toLowerCase().startsWith(query.toLowerCase());
}

function containsMatch(text: string, query: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

export default function ShortcutTrigger({
  filter,
  onSelect,
  onClose,
}: ShortcutTriggerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = ALL_SHORTCUTS.filter(
    (s) =>
      commandPrefixMatch(s.command, filter) ||
      containsMatch(s.label, filter) ||
      containsMatch(s.description, filter),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].command);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (filtered.length === 0) return null;

  return (
    <div
      className="animate-fade-in"
      style={{
        position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 4,
        borderRadius: 10, overflow: "hidden", zIndex: 50,
        background: "#1e2538", border: "1px solid rgba(255,255,255,0.18)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{
        padding: "6px 12px", fontSize: 10, color: "#6b7280",
        textTransform: "uppercase", letterSpacing: "0.05em",
        borderBottom: "1px solid rgba(255,255,255,0.18)",
      }}>
        Commands & Shortcuts
      </div>
      <div ref={listRef} style={{ maxHeight: 320, overflowY: "auto", padding: "4px 0" }}>
        {filtered.map((shortcut, index) => (
          <button
            key={shortcut.command}
            onClick={() => onSelect(shortcut.command)}
            onMouseEnter={() => setSelectedIndex(index)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "6px 12px", textAlign: "left", cursor: "pointer",
              background: index === selectedIndex ? "rgba(110,231,183,0.08)" : "none",
              border: "none", outline: "none",
            }}
          >
            <span style={{
              fontSize: 12, fontWeight: 500, width: 90, flexShrink: 0,
              color: shortcut.isSystem ? "#6ee7b7" : "#d1d5db",
            }}>
              {shortcut.command}
            </span>
            <span style={{
              fontSize: 11, color: "#6b7280",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {shortcut.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
