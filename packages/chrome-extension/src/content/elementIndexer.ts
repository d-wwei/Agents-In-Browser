interface InteractiveElementSummary {
  index: number;
  tag: string;
  role?: string;
  text?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  href?: string;
  ariaLabel?: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  '[role="button"]',
  "[onclick]",
  "[contenteditable='true']",
  "[tabindex]",
].join(",");

let currentElementMap = new Map<number, Element>();

function isElementVisible(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  const rect = htmlEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = window.getComputedStyle(htmlEl);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  if (htmlEl.hidden || el.getAttribute("aria-hidden") === "true") {
    return false;
  }

  return true;
}

function getElementText(el: Element): string {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function serializeInteractiveElement(index: number, el: Element): InteractiveElementSummary {
  const rect = (el as HTMLElement).getBoundingClientRect();
  return {
    index,
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("role") || undefined,
    text: getElementText(el) || undefined,
    type: el instanceof HTMLInputElement ? el.type || undefined : undefined,
    name: (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).name || undefined,
    placeholder:
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.placeholder || undefined
        : undefined,
    href: el instanceof HTMLAnchorElement ? el.href || undefined : undefined,
    ariaLabel: el.getAttribute("aria-label") || undefined,
    boundingBox: {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

export function buildInteractiveElementMap(): InteractiveElementSummary[] {
  const nextMap = new Map<number, Element>();
  const elements = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  const serialized: InteractiveElementSummary[] = [];

  let index = 0;
  for (const el of elements) {
    const tagName = el.tagName.toLowerCase();
    if (tagName === "script" || tagName === "style") continue;
    if (el.closest("script,style")) continue;
    if (el.getAttribute("aria-hidden") === "true") continue;
    if (!isElementVisible(el)) continue;

    nextMap.set(index, el);
    serialized.push(serializeInteractiveElement(index, el));
    index += 1;
  }

  currentElementMap = nextMap;
  return serialized;
}

export function getElementByIndex(index: number): Element {
  const el = currentElementMap.get(index);
  if (!el || !el.isConnected) {
    throw new Error(
      `Element index [${index}] not found or stale. Re-run browser_read or content_refresh_elements first.`,
    );
  }
  return el;
}

export function clearElementMap(): void {
  currentElementMap = new Map<number, Element>();
}

export function getCurrentInteractiveElements(): InteractiveElementSummary[] {
  const serialized: InteractiveElementSummary[] = [];
  for (const [index, el] of currentElementMap.entries()) {
    if (!el.isConnected) continue;
    serialized.push(serializeInteractiveElement(index, el));
  }
  return serialized;
}

export function getElementIndex(element: Element): number | undefined {
  for (const [index, el] of currentElementMap.entries()) {
    if (el === element) return index;
  }
  return undefined;
}

export type { InteractiveElementSummary };
