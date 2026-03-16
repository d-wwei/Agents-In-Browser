/**
 * Selection capture: floating "Chat Cmd+L" button on text selection.
 * Uses Shadow DOM for style isolation.
 * Also handles image hover button.
 */

import {
  SELECTION_BUTTON_ID,
  SELECTION_BUTTON_HIDE_DELAY_MS,
  IMAGE_HOVER_MIN_SIZE,
} from "../shared/constants";

let hostElement: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let buttonElement: HTMLButtonElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let currentMode: "selection" | "image" | null = null;
let hoveredImage: HTMLImageElement | null = null;

const BUTTON_STYLES = `
  :host {
    all: initial;
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
  }
  .acp-chat-btn {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(30, 30, 30, 0.88);
    color: #fff;
    font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 16px;
    cursor: pointer;
    white-space: nowrap;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: opacity 0.15s ease, transform 0.15s ease;
    opacity: 0;
    transform: translateY(4px);
    user-select: none;
    -webkit-user-select: none;
  }
  .acp-chat-btn.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .acp-chat-btn:hover {
    background: rgba(50, 50, 50, 0.95);
    border-color: rgba(255, 255, 255, 0.25);
  }
  .acp-chat-btn:active {
    transform: scale(0.96);
  }
  .acp-kbd {
    font-size: 10px;
    opacity: 0.6;
    margin-left: 2px;
  }
`;

function ensureShadowHost(): { host: HTMLDivElement; shadow: ShadowRoot; button: HTMLButtonElement } {
  if (hostElement && shadowRoot && buttonElement) {
    return { host: hostElement, shadow: shadowRoot, button: buttonElement };
  }

  // Clean up any stale elements
  const existing = document.getElementById(SELECTION_BUTTON_ID);
  if (existing) existing.remove();

  hostElement = document.createElement("div");
  hostElement.id = SELECTION_BUTTON_ID;
  hostElement.style.position = "fixed";
  hostElement.style.zIndex = "2147483647";
  hostElement.style.pointerEvents = "none";
  hostElement.style.top = "0";
  hostElement.style.left = "0";
  hostElement.style.width = "0";
  hostElement.style.height = "0";

  shadowRoot = hostElement.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = BUTTON_STYLES;
  shadowRoot.appendChild(style);

  buttonElement = document.createElement("button");
  buttonElement.className = "acp-chat-btn";

  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const shortcutKey = isMac ? "\u2318L" : "Ctrl+L";
  buttonElement.innerHTML = `Chat <span class="acp-kbd">${shortcutKey}</span>`;

  buttonElement.addEventListener("mousedown", (e) => {
    e.preventDefault(); // Prevent losing selection
    e.stopPropagation();
  });

  buttonElement.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleButtonClick();
  });

  shadowRoot.appendChild(buttonElement);
  document.documentElement.appendChild(hostElement);

  return { host: hostElement, shadow: shadowRoot, button: buttonElement };
}

function handleButtonClick(): void {
  if (currentMode === "selection") {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text) {
      chrome.runtime.sendMessage({
        type: "content_selection_quote",
        text,
        url: document.location.href,
        title: document.title,
      });
      // Clear selection after quoting
      selection?.removeAllRanges();
    }
  } else if (currentMode === "image" && hoveredImage) {
    const src = hoveredImage.src || hoveredImage.currentSrc;
    const alt = hoveredImage.alt || "";
    chrome.runtime.sendMessage({
      type: "content_image_quote",
      src,
      alt,
      url: document.location.href,
      title: document.title,
    });
  }

  hideButton();
}

function showButton(x: number, y: number, mode: "selection" | "image"): void {
  const { host, button } = ensureShadowHost();
  currentMode = mode;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  // Position button above the selection/element
  const offsetX = x;
  const offsetY = y - 36; // 36px above

  // Clamp to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampedX = Math.max(8, Math.min(offsetX, vw - 120));
  const clampedY = Math.max(8, Math.min(offsetY, vh - 40));

  host.style.top = `${clampedY}px`;
  host.style.left = `${clampedX}px`;
  host.style.width = "auto";
  host.style.height = "auto";
  host.style.pointerEvents = "auto";

  // Update label
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const shortcutKey = isMac ? "\u2318L" : "Ctrl+L";
  if (mode === "image") {
    button.innerHTML = `Chat (image) <span class="acp-kbd">${shortcutKey}</span>`;
  } else {
    button.innerHTML = `Chat <span class="acp-kbd">${shortcutKey}</span>`;
  }

  // Trigger animation
  button.classList.remove("visible");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      button.classList.add("visible");
    });
  });

  // Auto-hide after delay
  hideTimer = setTimeout(() => {
    hideButton();
  }, SELECTION_BUTTON_HIDE_DELAY_MS);
}

function hideButton(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (buttonElement) {
    buttonElement.classList.remove("visible");
  }
  if (hostElement) {
    hostElement.style.pointerEvents = "none";
  }
  currentMode = null;
  hoveredImage = null;
}

/**
 * Initialize selection capture listeners.
 */
export function initSelectionCapture(): void {
  // Text selection handler
  document.addEventListener("mouseup", (e) => {
    // Ignore if clicking on our own button
    if (hostElement && hostElement.contains(e.target as Node)) return;

    // Small delay to let selection finalize
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0) {
        // Position near the end of selection
        const range = selection!.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showButton(rect.right, rect.top, "selection");
      } else if (currentMode === "selection") {
        hideButton();
      }
    }, 10);
  });

  // Hide on scroll or resize (selection likely invalidated)
  document.addEventListener(
    "scroll",
    () => {
      if (currentMode === "selection") hideButton();
    },
    { passive: true },
  );
  window.addEventListener("resize", () => hideButton(), { passive: true });

  // Hide on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideButton();
    }
  });

  // Image hover handler
  document.addEventListener(
    "mouseover",
    (e) => {
      const target = e.target as Element;
      if (target instanceof HTMLImageElement) {
        const rect = target.getBoundingClientRect();
        if (rect.width >= IMAGE_HOVER_MIN_SIZE && rect.height >= IMAGE_HOVER_MIN_SIZE) {
          hoveredImage = target;
          showButton(rect.right - 8, rect.top + 8, "image");
        }
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      const target = e.target as Element;
      if (target instanceof HTMLImageElement && currentMode === "image") {
        // Delay hiding so user can reach the button
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          if (currentMode === "image") hideButton();
        }, 500);
      }
    },
    { passive: true },
  );
}

/**
 * Cleanup: remove shadow host from DOM.
 */
export function destroySelectionCapture(): void {
  hideButton();
  if (hostElement) {
    hostElement.remove();
    hostElement = null;
    shadowRoot = null;
    buttonElement = null;
  }
}
