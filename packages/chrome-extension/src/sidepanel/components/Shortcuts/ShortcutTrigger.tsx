import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from "react";

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
    <div className="absolute bottom-full left-2 right-2 mb-1 glass-dropdown rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
      <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider border-b border-glass-border">
        Shortcuts
      </div>
      <div ref={listRef} className="max-h-48 overflow-y-auto py-1">
        {filtered.map((shortcut, index) => (
          <button
            key={shortcut.command}
            onClick={() => onSelect(shortcut.command)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors duration-150 ${
              index === selectedIndex ? "bg-bg-hover/50" : ""
            }`}
          >
            <span className="text-[12px] text-accent font-medium w-20 shrink-0">
              {shortcut.command}
            </span>
            <span className="text-[11px] text-text-secondary truncate">
              {shortcut.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
