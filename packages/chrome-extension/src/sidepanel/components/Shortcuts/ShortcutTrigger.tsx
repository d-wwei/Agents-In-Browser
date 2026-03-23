import { useState, useEffect, useCallback, useRef } from "react";

interface Shortcut {
  command: string;
  label: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
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

interface ShortcutTriggerProps {
  filter: string;
  onSelect: (command: string) => void;
  onClose: () => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function ShortcutTrigger({
  filter,
  onSelect,
  onClose,
}: ShortcutTriggerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = SHORTCUTS.filter(
    (s) =>
      fuzzyMatch(s.command, filter) ||
      fuzzyMatch(s.label, filter) ||
      fuzzyMatch(s.description, filter),
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
      } else if (e.key === "Enter") {
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
        Shortcuts
      </div>
      <div ref={listRef} style={{ maxHeight: 192, overflowY: "auto", padding: "4px 0" }}>
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
            <span style={{ fontSize: 12, color: "#d1d5db", fontWeight: 500, width: 80, flexShrink: 0 }}>
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
