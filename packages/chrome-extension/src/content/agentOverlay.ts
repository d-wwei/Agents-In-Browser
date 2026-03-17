let overlayRoot: HTMLDivElement | null = null;
let badgeEl: HTMLDivElement | null = null;
let toastEl: HTMLDivElement | null = null;

function ensureOverlay(): void {
  if (overlayRoot) return;
  overlayRoot = document.createElement("div");
  overlayRoot.id = "acp-agent-overlay";
  overlayRoot.style.position = "fixed";
  overlayRoot.style.inset = "0";
  overlayRoot.style.pointerEvents = "none";
  overlayRoot.style.zIndex = "2147483646";

  badgeEl = document.createElement("div");
  badgeEl.textContent = "Agent active";
  badgeEl.style.position = "fixed";
  badgeEl.style.top = "12px";
  badgeEl.style.right = "12px";
  badgeEl.style.background = "rgba(30, 64, 175, 0.9)";
  badgeEl.style.color = "#fff";
  badgeEl.style.padding = "6px 10px";
  badgeEl.style.borderRadius = "999px";
  badgeEl.style.fontSize = "12px";
  badgeEl.style.fontFamily = "system-ui, sans-serif";

  toastEl = document.createElement("div");
  toastEl.style.position = "fixed";
  toastEl.style.top = "44px";
  toastEl.style.right = "12px";
  toastEl.style.background = "rgba(30, 64, 175, 0.92)";
  toastEl.style.color = "#fff";
  toastEl.style.padding = "6px 10px";
  toastEl.style.borderRadius = "8px";
  toastEl.style.fontSize = "12px";
  toastEl.style.fontFamily = "system-ui, sans-serif";
  toastEl.style.opacity = "0";
  toastEl.style.transition = "opacity 120ms ease";

  overlayRoot.appendChild(badgeEl);
  overlayRoot.appendChild(toastEl);
  document.documentElement.appendChild(overlayRoot);
}

export function showAgentOverlay(): void {
  ensureOverlay();
  if (overlayRoot) overlayRoot.style.display = "block";
}

export function hideAgentOverlay(): void {
  if (!overlayRoot) return;
  overlayRoot.remove();
  overlayRoot = null;
  badgeEl = null;
  toastEl = null;
}

export function showActionFeedback(action: string, target = ""): void {
  ensureOverlay();
  if (!toastEl) return;
  toastEl.textContent = target ? `${action}: ${target}` : action;
  toastEl.style.opacity = "1";
  window.setTimeout(() => {
    if (toastEl) toastEl.style.opacity = "0";
  }, 1200);
}

export function highlightElement(
  element: Element,
  label?: string,
  duration = 2000,
  color = "#2563eb",
): void {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  ensureOverlay();
  if (!overlayRoot) return;

  const box = document.createElement("div");
  box.style.position = "fixed";
  box.style.left = `${Math.max(0, rect.left)}px`;
  box.style.top = `${Math.max(0, rect.top)}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  box.style.border = `2px solid ${color}`;
  box.style.background = "rgba(37, 99, 235, 0.12)";
  box.style.borderRadius = "6px";
  box.style.boxSizing = "border-box";

  if (label) {
    const tag = document.createElement("div");
    tag.textContent = label;
    tag.style.position = "absolute";
    tag.style.left = "0";
    tag.style.top = "-20px";
    tag.style.background = color;
    tag.style.color = "#fff";
    tag.style.fontSize = "11px";
    tag.style.fontFamily = "system-ui, sans-serif";
    tag.style.padding = "1px 6px";
    tag.style.borderRadius = "999px";
    box.appendChild(tag);
  }

  overlayRoot.appendChild(box);
  window.setTimeout(() => box.remove(), duration);
}
