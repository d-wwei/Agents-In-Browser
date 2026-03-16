/**
 * DOM interaction utilities for content scripts.
 * Provides click, type, scroll, select, and wait operations.
 */

/**
 * Find an element by CSS selector. Throws if not found.
 */
function queryElement<T extends Element = Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) {
    throw new Error(`Element not found: ${selector}`);
  }
  return el;
}

/**
 * Find an element at given coordinates.
 */
function elementAtPoint(x: number, y: number): Element {
  const el = document.elementFromPoint(x, y);
  if (!el) {
    throw new Error(`No element at coordinates (${x}, ${y})`);
  }
  return el;
}

/**
 * Check if an element is visible (in viewport and not hidden).
 */
function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return true;
}

/**
 * Scroll an element into view if needed, then get its center coordinates.
 */
function getElementCenter(el: Element): { x: number; y: number } {
  el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Dispatch mouse events to simulate a real click.
 */
function dispatchClick(el: Element, x: number, y: number): void {
  const common = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  };
  el.dispatchEvent(new MouseEvent("mousedown", common));
  el.dispatchEvent(new MouseEvent("mouseup", common));
  el.dispatchEvent(new MouseEvent("click", common));
}

/**
 * Click an element by selector or coordinates.
 */
export function click(params: { selector?: string; x?: number; y?: number }): { clicked: string } {
  let el: Element;
  let cx: number;
  let cy: number;

  if (params.selector) {
    el = queryElement(params.selector);
    if (!isElementVisible(el)) {
      throw new Error(`Element is not visible: ${params.selector}`);
    }
    const center = getElementCenter(el);
    cx = center.x;
    cy = center.y;
  } else if (params.x !== undefined && params.y !== undefined) {
    cx = params.x;
    cy = params.y;
    el = elementAtPoint(cx, cy);
  } else {
    throw new Error("Must provide either selector or (x, y) coordinates");
  }

  // Check for password fields
  if (
    el instanceof HTMLInputElement &&
    (el.type === "password" ||
      el.name?.toLowerCase().includes("password") ||
      el.autocomplete === "current-password" ||
      el.autocomplete === "new-password")
  ) {
    throw new Error("Cannot interact with password fields for security reasons");
  }

  dispatchClick(el, cx, cy);

  // If it's a focusable element, also focus it
  if (el instanceof HTMLElement) {
    el.focus();
  }

  const description =
    params.selector ||
    `element at (${params.x}, ${params.y}): <${el.tagName.toLowerCase()}>`;
  return { clicked: description };
}

/**
 * Type text into a form field.
 */
export function type(params: {
  selector: string;
  text: string;
  clearFirst: boolean;
}): { typed: string; selector: string } {
  const el = queryElement<HTMLElement>(params.selector);

  // Security: block password fields
  if (
    el instanceof HTMLInputElement &&
    (el.type === "password" ||
      el.name?.toLowerCase().includes("password") ||
      el.autocomplete === "current-password" ||
      el.autocomplete === "new-password")
  ) {
    throw new Error("Cannot type into password fields for security reasons");
  }

  if (!isElementVisible(el)) {
    throw new Error(`Element is not visible: ${params.selector}`);
  }

  // Focus the element
  el.focus();
  const center = getElementCenter(el);
  dispatchClick(el, center.x, center.y);

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (params.clearFirst) {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Type character by character for better compatibility with frameworks
    const existingValue = el.value;
    for (let i = 0; i < params.text.length; i++) {
      const char = params.text[i];
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, bubbles: true }),
      );
      el.value = existingValue + params.text.slice(0, i + 1);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(
        new KeyboardEvent("keyup", { key: char, bubbles: true }),
      );
    }
    // Set final value directly to ensure it sticks
    if (params.clearFirst) {
      el.value = params.text;
    } else {
      el.value = existingValue + params.text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.isContentEditable) {
    if (params.clearFirst) {
      el.textContent = "";
    }
    // Use execCommand for contenteditable
    document.execCommand("insertText", false, params.text);
  } else {
    throw new Error(`Element is not an input, textarea, or contenteditable: ${params.selector}`);
  }

  return { typed: params.text, selector: params.selector };
}

/**
 * Scroll the page in a direction.
 */
export function scroll(params: {
  direction: "up" | "down" | "left" | "right";
  amount: number;
}): { scrolled: string; position: { x: number; y: number } } {
  const { direction, amount } = params;
  const scrollOptions: ScrollToOptions = { behavior: "smooth" };

  switch (direction) {
    case "up":
      scrollOptions.top = -amount;
      break;
    case "down":
      scrollOptions.top = amount;
      break;
    case "left":
      scrollOptions.left = -amount;
      break;
    case "right":
      scrollOptions.left = amount;
      break;
  }

  window.scrollBy(scrollOptions);

  return {
    scrolled: `${direction} by ${amount}px`,
    position: { x: window.scrollX, y: window.scrollY },
  };
}

/**
 * Select an option in a <select> element.
 */
export function select(params: {
  selector: string;
  value: string;
}): { selected: string; selector: string } {
  const el = queryElement<HTMLSelectElement>(params.selector);

  if (!(el instanceof HTMLSelectElement)) {
    throw new Error(`Element is not a <select>: ${params.selector}`);
  }

  if (!isElementVisible(el)) {
    throw new Error(`Element is not visible: ${params.selector}`);
  }

  // Find the option
  let found = false;
  for (const option of el.options) {
    if (option.value === params.value || option.textContent?.trim() === params.value) {
      option.selected = true;
      found = true;
      break;
    }
  }

  if (!found) {
    const available = Array.from(el.options)
      .map((o) => `"${o.value}" (${o.textContent?.trim()})`)
      .join(", ");
    throw new Error(
      `Option "${params.value}" not found in select. Available: ${available}`,
    );
  }

  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("input", { bubbles: true }));

  return { selected: params.value, selector: params.selector };
}

/**
 * Wait for an element to meet a condition.
 */
export function waitForElement(params: {
  selector: string;
  timeout: number;
  condition: "visible" | "hidden" | "attached" | "loaded";
}): Promise<{ found: boolean; elapsed: number }> {
  const { selector, timeout, condition } = params;
  const start = Date.now();

  return new Promise((resolve) => {
    function check(): boolean {
      const el = document.querySelector(selector);
      switch (condition) {
        case "attached":
          return el !== null;
        case "visible":
          return el !== null && isElementVisible(el);
        case "hidden":
          return el === null || !isElementVisible(el);
        case "loaded":
          return document.readyState === "complete" && el !== null;
        default:
          return el !== null;
      }
    }

    if (check()) {
      resolve({ found: true, elapsed: Date.now() - start });
      return;
    }

    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect();
        clearTimeout(timer);
        resolve({ found: true, elapsed: Date.now() - start });
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve({ found: false, elapsed: Date.now() - start });
    }, timeout);
  });
}
