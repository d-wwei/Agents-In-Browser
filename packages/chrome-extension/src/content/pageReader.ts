/**
 * DOM to Markdown conversion.
 * Strips non-content elements, converts semantic HTML to markdown,
 * with priority truncation favoring main content areas.
 */

import { buildInteractiveElementMap } from "./elementIndexer";
import type { InteractiveElementSummary } from "./elementIndexer";

const REMOVE_TAGS = new Set([
  "script", "style", "noscript", "svg", "canvas", "template",
  "iframe", "object", "embed", "applet",
]);

const SKIP_TAGS = new Set([
  "nav", "footer", "header", "aside",
]);

const BLOCK_TAGS = new Set([
  "div", "p", "section", "article", "main", "blockquote",
  "ul", "ol", "li", "table", "thead", "tbody", "tfoot",
  "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6",
  "pre", "code", "figure", "figcaption", "details", "summary",
  "dl", "dt", "dd", "hr", "br", "form", "fieldset",
]);

interface ReaderOptions {
  selector?: string;
  maxLength?: number;
  includeInteractiveElements?: boolean;
}

/**
 * Read page DOM and convert to simplified Markdown.
 */
export function readPageAsMarkdown(options: ReaderOptions = {}): {
  markdown: string;
  title: string;
  url: string;
  interactiveElements?: InteractiveElementSummary[];
} {
  const { selector, maxLength = 32_000, includeInteractiveElements = false } = options;

  const title = document.title || "";
  const url = document.location.href;

  let root: Element | null = null;

  if (selector) {
    root = document.querySelector(selector);
    if (!root) {
      return {
        markdown: `[No element found for selector: ${selector}]`,
        title,
        url,
        interactiveElements: includeInteractiveElements ? [] : undefined,
      };
    }
  }

  // Priority order: selected element > main/article > body
  if (!root) {
    root =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector('[role="main"]') ||
      document.body;
  }

  if (!root) {
    return {
      markdown: "[Empty page]",
      title,
      url,
      interactiveElements: includeInteractiveElements ? [] : undefined,
    };
  }

  const lines: string[] = [];
  let charCount = 0;
  let truncated = false;

  function shouldStop(): boolean {
    return charCount >= maxLength;
  }

  function addLine(line: string): void {
    if (truncated) return;
    const newCount = charCount + line.length + 1; // +1 for newline
    if (newCount > maxLength) {
      const remaining = maxLength - charCount;
      if (remaining > 20) {
        lines.push(line.slice(0, remaining - 12) + "…[truncated]");
      }
      truncated = true;
      return;
    }
    lines.push(line);
    charCount = newCount;
  }

  function isHidden(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    if (el.hidden) return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    const style = el.style;
    if (style.display === "none" || style.visibility === "hidden") return true;
    // Check computed style only for direct children of body to avoid perf issues
    return false;
  }

  function getTextContent(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || "").replace(/\s+/g, " ");
    }
    return "";
  }

  function processNode(node: Node, depth: number, inPre: boolean): void {
    if (truncated) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = getTextContent(node).trim();
      if (text) {
        addLine(text);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // Remove entirely
    if (REMOVE_TAGS.has(tag)) return;

    // Skip hidden elements
    if (isHidden(el)) return;

    // Skip nav/footer/etc if we're processing body (not a specific selector)
    if (!options.selector && SKIP_TAGS.has(tag) && depth < 3) return;

    // Headings
    if (/^h([1-6])$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text) {
        addLine("");
        addLine("#".repeat(level) + " " + text);
        addLine("");
      }
      return;
    }

    // Paragraphs
    if (tag === "p") {
      const text = inlineToMarkdown(el);
      if (text.trim()) {
        addLine("");
        addLine(text.trim());
      }
      return;
    }

    // Links standalone
    if (tag === "a") {
      const href = el.getAttribute("href") || "";
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        const absoluteHref = resolveUrl(href);
        addLine(`[${text}](${absoluteHref})`);
      } else if (text) {
        addLine(text);
      }
      return;
    }

    // Images
    if (tag === "img") {
      const alt = el.getAttribute("alt") || "";
      const src = el.getAttribute("src") || "";
      if (src) {
        const absoluteSrc = resolveUrl(src);
        addLine(`![${alt}](${absoluteSrc})`);
      }
      return;
    }

    // Horizontal rule
    if (tag === "hr") {
      addLine("");
      addLine("---");
      addLine("");
      return;
    }

    // Line break
    if (tag === "br") {
      addLine("");
      return;
    }

    // Lists
    if (tag === "ul" || tag === "ol") {
      addLine("");
      processListItems(el, tag === "ol", 0);
      addLine("");
      return;
    }

    // Table
    if (tag === "table") {
      addLine("");
      processTable(el);
      addLine("");
      return;
    }

    // Pre/code blocks
    if (tag === "pre") {
      const codeEl = el.querySelector("code");
      const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || "";
      const text = (el.textContent || "").trimEnd();
      addLine("");
      addLine("```" + lang);
      for (const line of text.split("\n")) {
        addLine(line);
        if (shouldStop()) break;
      }
      addLine("```");
      addLine("");
      return;
    }

    // Blockquote
    if (tag === "blockquote") {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text) {
        addLine("");
        for (const line of text.split("\n")) {
          addLine("> " + line.trim());
        }
        addLine("");
      }
      return;
    }

    // Details/summary
    if (tag === "details") {
      const summary = el.querySelector("summary");
      if (summary) {
        const text = (summary.textContent || "").replace(/\s+/g, " ").trim();
        if (text) addLine(`**${text}**`);
      }
      for (const child of el.childNodes) {
        if (child !== summary) {
          processNode(child, depth + 1, inPre);
        }
      }
      return;
    }

    // Definition lists
    if (tag === "dt") {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text) addLine(`**${text}**`);
      return;
    }
    if (tag === "dd") {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text) addLine(`: ${text}`);
      return;
    }

    // Strong / em
    if (tag === "strong" || tag === "b") {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text) addLine(`**${text}**`);
      return;
    }
    if (tag === "em" || tag === "i") {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text) addLine(`*${text}*`);
      return;
    }

    // Generic: recurse children
    for (const child of el.childNodes) {
      processNode(child, depth + 1, inPre);
      if (shouldStop()) break;
    }
  }

  function processListItems(listEl: Element, ordered: boolean, indent: number): void {
    let index = 1;
    for (const child of listEl.children) {
      if (shouldStop()) break;
      if (child.tagName.toLowerCase() === "li") {
        const prefix = "  ".repeat(indent) + (ordered ? `${index}. ` : "- ");
        // Check for nested lists
        const nestedList = child.querySelector(":scope > ul, :scope > ol");
        const textParts: string[] = [];
        for (const node of child.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const t = (node.textContent || "").replace(/\s+/g, " ").trim();
            if (t) textParts.push(t);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const nodeTag = (node as Element).tagName.toLowerCase();
            if (nodeTag !== "ul" && nodeTag !== "ol") {
              const t = ((node as Element).textContent || "").replace(/\s+/g, " ").trim();
              if (t) textParts.push(t);
            }
          }
        }
        const text = textParts.join(" ");
        if (text) addLine(prefix + text);
        if (nestedList) {
          processListItems(nestedList, nestedList.tagName.toLowerCase() === "ol", indent + 1);
        }
        index++;
      }
    }
  }

  function processTable(tableEl: Element): void {
    const rows: string[][] = [];
    let headerRow = false;

    const thead = tableEl.querySelector("thead");
    const tbody = tableEl.querySelector("tbody") || tableEl;

    if (thead) {
      for (const tr of thead.querySelectorAll("tr")) {
        const cells: string[] = [];
        for (const cell of tr.querySelectorAll("th, td")) {
          cells.push((cell.textContent || "").replace(/\s+/g, " ").trim());
        }
        if (cells.length > 0) {
          rows.push(cells);
          headerRow = true;
        }
      }
    }

    const bodyEl = thead ? tbody : tableEl;
    for (const tr of bodyEl.querySelectorAll(thead ? "tbody tr, tr" : "tr")) {
      if (shouldStop()) break;
      // Skip rows already processed in thead
      if (thead && tr.closest("thead")) continue;
      const cells: string[] = [];
      for (const cell of tr.querySelectorAll("th, td")) {
        cells.push((cell.textContent || "").replace(/\s+/g, " ").trim());
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length === 0) return;

    // Determine column count
    const colCount = Math.max(...rows.map((r) => r.length));

    // Normalize row widths
    for (const row of rows) {
      while (row.length < colCount) row.push("");
    }

    // Render
    for (let i = 0; i < rows.length; i++) {
      addLine("| " + rows[i].join(" | ") + " |");
      if (i === 0 && (headerRow || rows.length > 1)) {
        addLine("| " + rows[i].map(() => "---").join(" | ") + " |");
      }
      if (shouldStop()) break;
    }
  }

  function inlineToMarkdown(el: Element): string {
    let result = "";
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        result += (child.textContent || "").replace(/\s+/g, " ");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as Element;
        const childTag = childEl.tagName.toLowerCase();
        const text = inlineToMarkdown(childEl);
        if (childTag === "strong" || childTag === "b") {
          result += `**${text.trim()}**`;
        } else if (childTag === "em" || childTag === "i") {
          result += `*${text.trim()}*`;
        } else if (childTag === "code") {
          result += `\`${text.trim()}\``;
        } else if (childTag === "a") {
          const href = childEl.getAttribute("href") || "";
          if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
            result += `[${text.trim()}](${resolveUrl(href)})`;
          } else {
            result += text;
          }
        } else if (childTag === "img") {
          const alt = childEl.getAttribute("alt") || "";
          const src = childEl.getAttribute("src") || "";
          if (src) result += `![${alt}](${resolveUrl(src)})`;
        } else if (childTag === "br") {
          result += "\n";
        } else {
          result += text;
        }
      }
    }
    return result;
  }

  function resolveUrl(href: string): string {
    try {
      return new URL(href, document.baseURI).href;
    } catch {
      return href;
    }
  }

  processNode(root, 0, false);

  let markdown = lines.join("\n");

  // Clean up excessive blank lines
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();

  let interactiveElements: InteractiveElementSummary[] | undefined;
  if (includeInteractiveElements) {
    interactiveElements = buildInteractiveElementMap();
    if (interactiveElements.length > 0) {
      markdown += "\n\n## Interactive Elements\n";
      const interactiveLines = interactiveElements.map((item) => {
        const parts = [`[${item.index}] <${item.tag}>`];
        if (item.href) parts.push(`href=\"${item.href}\"`);
        if (item.type) parts.push(`type=\"${item.type}\"`);
        if (item.name) parts.push(`name=\"${item.name}\"`);
        if (item.placeholder) parts.push(`placeholder=\"${item.placeholder}\"`);
        const label = item.ariaLabel || item.text;
        if (label) parts.push(`\"${label}\"`);
        return parts.join(" ");
      });
      markdown += interactiveLines.join("\n");
      markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();
    }
  }

  return { markdown, title, url, interactiveElements };
}
