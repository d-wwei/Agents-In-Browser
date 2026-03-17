/**
 * Screenshot capture utilities for content scripts.
 * Provides helpers for visible area info and element screenshots.
 */

import { getCurrentInteractiveElements, getElementByIndex } from "./elementIndexer";

export interface ViewportInfo {
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  devicePixelRatio: number;
}

/**
 * Get current viewport information for screenshot context.
 */
export function getViewportInfo(): ViewportInfo {
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

/**
 * Scroll to a specific position for screenshot tiling (full page capture).
 * Returns the actual scroll position after scrolling.
 */
export function scrollToPosition(x: number, y: number): { scrollX: number; scrollY: number } {
  window.scrollTo({ left: x, top: y, behavior: "instant" });
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

/**
 * Get the bounding rect of an element for targeted screenshots.
 */
export function getElementBounds(selector: string): {
  x: number;
  y: number;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
} | null {
  const el = document.querySelector(selector);
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

/**
 * Highlight an element temporarily (useful for annotating screenshots).
 * Returns a cleanup function to remove the highlight.
 */
export function highlightElement(
  selector: string,
  color = "rgba(255, 0, 0, 0.3)",
  duration = 2000,
): boolean {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return false;

  const originalOutline = el.style.outline;
  const originalOutlineOffset = el.style.outlineOffset;
  const originalBg = el.style.backgroundColor;

  el.style.outline = `2px solid ${color}`;
  el.style.outlineOffset = "-1px";
  el.style.backgroundColor = color;

  setTimeout(() => {
    el.style.outline = originalOutline;
    el.style.outlineOffset = originalOutlineOffset;
    el.style.backgroundColor = originalBg;
  }, duration);

  return true;
}

let annotationNodes: HTMLElement[] = [];

export function annotateInteractiveElements(): number {
  clearInteractiveElementAnnotations();
  const interactiveElements = getCurrentInteractiveElements();

  for (const item of interactiveElements) {
    let el: Element;
    try {
      el = getElementByIndex(item.index);
    } catch {
      continue;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const label = document.createElement("div");
    label.textContent = String(item.index);
    label.style.position = "fixed";
    label.style.left = `${Math.max(0, rect.left)}px`;
    label.style.top = `${Math.max(0, rect.top - 14)}px`;
    label.style.width = "18px";
    label.style.height = "18px";
    label.style.lineHeight = "18px";
    label.style.textAlign = "center";
    label.style.borderRadius = "999px";
    label.style.background = "#2563eb";
    label.style.color = "#fff";
    label.style.fontSize = "11px";
    label.style.fontWeight = "700";
    label.style.fontFamily = "system-ui, sans-serif";
    label.style.zIndex = "2147483647";
    label.style.pointerEvents = "none";
    label.style.boxShadow = "0 1px 4px rgba(0,0,0,0.25)";

    document.documentElement.appendChild(label);
    annotationNodes.push(label);
  }

  return annotationNodes.length;
}

export function clearInteractiveElementAnnotations(): void {
  for (const node of annotationNodes) {
    node.remove();
  }
  annotationNodes = [];
}

/**
 * Calculate tile positions for full-page screenshot.
 * Returns an array of scroll positions to capture.
 */
export function calculateScreenshotTiles(): Array<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dw = document.documentElement.scrollWidth;
  const dh = document.documentElement.scrollHeight;

  const tiles: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (let y = 0; y < dh; y += vh) {
    for (let x = 0; x < dw; x += vw) {
      tiles.push({
        x,
        y,
        width: Math.min(vw, dw - x),
        height: Math.min(vh, dh - y),
      });
    }
  }

  return tiles;
}
