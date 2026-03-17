import { getElementIndex } from "./elementIndexer";

const ROLE_BY_TAG: Record<string, string> = {
  a: "link",
  button: "button",
  input: "textbox",
  select: "combobox",
  textarea: "textbox",
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  form: "form",
  img: "img",
  table: "table",
  ul: "list",
  ol: "list",
  li: "listitem",
};

function isHidden(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  if (htmlEl.hidden) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  const style = window.getComputedStyle(htmlEl);
  return style.display === "none" || style.visibility === "hidden";
}

function getRole(el: Element): string | undefined {
  return el.getAttribute("role") || ROLE_BY_TAG[el.tagName.toLowerCase()];
}

function getLabel(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 80);
  if (el instanceof HTMLInputElement) {
    return el.placeholder || el.name || el.type || "input";
  }
  return el.tagName.toLowerCase();
}

function serializeNode(el: Element, depth: number): string {
  const role = getRole(el);
  const label = getLabel(el);
  const attrs: string[] = [];

  const index = getElementIndex(el);
  if (typeof index === "number") attrs.push(`[${index}]`);
  if (role) attrs.push(`role=${role}`);

  const ariaExpanded = el.getAttribute("aria-expanded");
  if (ariaExpanded) attrs.push(`expanded=${ariaExpanded}`);
  const ariaChecked = el.getAttribute("aria-checked");
  if (ariaChecked) attrs.push(`checked=${ariaChecked}`);

  const indent = "  ".repeat(depth);
  return `${indent}- ${attrs.join(" ")} \"${label}\"`.trimEnd();
}

export function buildAccessibilityTree(root?: Element): string {
  const start = root || document.body;
  if (!start) return "[Empty page]";

  const lines: string[] = [];

  function walk(el: Element, depth: number): void {
    if (isHidden(el)) return;

    const role = getRole(el);
    const index = getElementIndex(el);
    const shouldInclude = Boolean(role) || typeof index === "number";

    if (shouldInclude) {
      lines.push(serializeNode(el, depth));
      depth += 1;
    }

    for (const child of Array.from(el.children)) {
      walk(child, depth);
    }
  }

  walk(start, 0);
  return lines.join("\n") || "[No accessibility nodes found]";
}
