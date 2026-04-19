/**
 * overlay.ts
 *
 * Renders the hover-highlight overlay, tooltip, and selection UI.
 * All DOM is created with raw DOM manipulation to avoid interfering
 * with the app being inspected.
 */

import { resolveTheme } from "./theme.js";
import type { StateMachine } from "./state-machine.js";
import type { AstroGrabTheme, SourceLocation } from "./types.js";

// ── Styles ───────────────────────────────────────────────────────────

function createOverlayStyles(theme: AstroGrabTheme): string {
  return `
  .astro-grab-overlay {
    position: fixed;
    pointer-events: none;
    z-index: 2147483647;
    border: 2px solid ${theme.accent};
    background: ${theme.overlay};
    border-radius: 3px;
    transition: all 0.08s ease-out;
  }

  .astro-grab-tooltip {
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    background: ${theme.surface};
    color: ${theme.text};
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 12px;
    line-height: 1.4;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid ${theme.border};
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    max-width: 480px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .astro-grab-tooltip .ag-component {
    color: ${theme.accentSoft};
    font-weight: 600;
  }

  .astro-grab-tooltip .ag-file {
    color: ${theme.accentSoft};
    opacity: 0.85;
  }

  .astro-grab-tooltip .ag-tag {
    color: ${theme.tag};
  }

  .astro-grab-toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    z-index: 2147483647;
    background: ${theme.surface};
    color: ${theme.text};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    padding: 10px 18px;
    border-radius: 8px;
    border: 1px solid ${theme.border};
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    opacity: 0;
    transition: opacity 0.2s, transform 0.2s;
    pointer-events: none;
  }

  .astro-grab-toast.ag-visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .astro-grab-badge {
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: 2147483646;
    background: ${theme.surface};
    color: ${theme.accentSoft};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid ${theme.border};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    cursor: default;
    user-select: none;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .astro-grab-badge:hover { opacity: 1; }

  .astro-grab-crosshair {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2147483646;
    display: none;
  }

  .astro-grab-crosshair-line {
    position: absolute;
    background: ${theme.crosshair};
    pointer-events: none;
  }

  .ag-crosshair-v {
    width: 1px;
  }

  .ag-crosshair-h {
    height: 1px;
  }
`;
}

// ── Overlay class ────────────────────────────────────────────────────

export class Overlay {
  private styleEl: HTMLStyleElement;
  private overlayEl: HTMLDivElement;
  private tooltipEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private badgeEl: HTMLDivElement;
  private crosshairEl: HTMLDivElement;
  private lineTop: HTMLDivElement;
  private lineBottom: HTMLDivElement;
  private lineLeft: HTMLDivElement;
  private lineRight: HTMLDivElement;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private _mounted = false;
  private unsubscribeState: (() => void) | null = null;
  private lastHighlightRect: DOMRect | null = null;
  readonly theme: AstroGrabTheme;

  constructor(theme?: Partial<AstroGrabTheme>) {
    this.theme = resolveTheme(theme);
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = createOverlayStyles(this.theme);

    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "astro-grab-overlay";
    this.overlayEl.style.display = "none";

    this.tooltipEl = document.createElement("div");
    this.tooltipEl.className = "astro-grab-tooltip";
    this.tooltipEl.style.display = "none";

    this.toastEl = document.createElement("div");
    this.toastEl.className = "astro-grab-toast";

    this.badgeEl = document.createElement("div");
    this.badgeEl.className = "astro-grab-badge";
    this.badgeEl.textContent = "\u26A1 astro-grab";

    // Crosshair container + 4 directional lines
    this.crosshairEl = document.createElement("div");
    this.crosshairEl.className = "astro-grab-crosshair";

    this.lineTop = this.createCrosshairLine("ag-crosshair-v");
    this.lineBottom = this.createCrosshairLine("ag-crosshair-v");
    this.lineLeft = this.createCrosshairLine("ag-crosshair-h");
    this.lineRight = this.createCrosshairLine("ag-crosshair-h");

    this.crosshairEl.appendChild(this.lineTop);
    this.crosshairEl.appendChild(this.lineBottom);
    this.crosshairEl.appendChild(this.lineLeft);
    this.crosshairEl.appendChild(this.lineRight);
  }

  private createCrosshairLine(directionClass: string): HTMLDivElement {
    const line = document.createElement("div");
    line.className = `astro-grab-crosshair-line ${directionClass}`;
    return line;
  }

  mount() {
    if (this._mounted) return;
    this._mounted = true;

    document.head.appendChild(this.styleEl);
    document.body.appendChild(this.overlayEl);
    document.body.appendChild(this.tooltipEl);
    document.body.appendChild(this.toastEl);
    document.body.appendChild(this.badgeEl);
    document.body.appendChild(this.crosshairEl);
  }

  unmount() {
    if (!this._mounted) return;
    this._mounted = false;

    this.unsubscribeState?.();
    this.unsubscribeState = null;

    this.styleEl.remove();
    this.overlayEl.remove();
    this.tooltipEl.remove();
    this.toastEl.remove();
    this.badgeEl.remove();
    this.crosshairEl.remove();
  }

  /**
   * Wire the overlay to a state machine.
   * `targeting` → show overlay elements, `idle` → hide overlay + clear highlight.
   */
  connectStateMachine(sm: StateMachine): void {
    // Clean up any previous subscription
    this.unsubscribeState?.();

    this.unsubscribeState = sm.subscribe((state) => {
      if (state === "idle") {
        this.clearHighlight();
        this.hideCrosshair();
      } else if (state === "targeting") {
        this.crosshairEl.style.display = "block";
      }
    });
  }

  /** Position the overlay highlight over a target element */
  highlight(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    this.lastHighlightRect = rect;
    const s = this.overlayEl.style;
    s.display = "block";
    s.top = rect.top + "px";
    s.left = rect.left + "px";
    s.width = rect.width + "px";
    s.height = rect.height + "px";
  }

  /** Hide the overlay highlight */
  clearHighlight() {
    this.overlayEl.style.display = "none";
    this.tooltipEl.style.display = "none";
    this.lastHighlightRect = null;
  }

  /** Show the tooltip near the highlighted element */
  showTooltip(el: HTMLElement, source: SourceLocation | null, componentName: string | null) {
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();

    let html = `<span class="ag-tag">&lt;${tag}&gt;</span>`;
    if (componentName) {
      html = `<span class="ag-component">&lt;${componentName} /&gt;</span> \u2192 ${html}`;
    }
    if (source) {
      html += ` <span class="ag-file">${source.file}:${source.line}</span>`;
    }

    this.tooltipEl.innerHTML = html;
    this.tooltipEl.style.display = "block";

    // Position: above the element, or below if not enough space
    const tooltipHeight = 32;
    const gap = 8;
    let top = rect.top - tooltipHeight - gap;
    if (top < 4) top = rect.bottom + gap;

    let left = rect.left;
    // Keep within viewport
    const tooltipWidth = this.tooltipEl.offsetWidth;
    if (left + tooltipWidth > window.innerWidth - 8) {
      left = window.innerWidth - tooltipWidth - 8;
    }
    if (left < 4) left = 4;

    this.tooltipEl.style.top = top + "px";
    this.tooltipEl.style.left = left + "px";
  }

  /**
   * Update crosshair lines to extend between the cursor and the
   * currently highlighted element's bounding rect edges.
   * If no element is highlighted, hides the crosshair lines.
   */
  updateCrosshair(cursorX: number, cursorY: number) {
    const rect = this.lastHighlightRect;
    if (!rect) {
      this.hideCrosshair();
      return;
    }

    // Top line: from viewport top (0) to element top, at cursorX
    this.lineTop.style.left = cursorX + "px";
    this.lineTop.style.top = "0";
    this.lineTop.style.height = Math.max(0, rect.top) + "px";

    // Bottom line: from element bottom to viewport bottom, at cursorX
    this.lineBottom.style.left = cursorX + "px";
    this.lineBottom.style.top = rect.bottom + "px";
    this.lineBottom.style.height = Math.max(0, window.innerHeight - rect.bottom) + "px";

    // Left line: from viewport left (0) to element left, at cursorY
    this.lineLeft.style.left = "0";
    this.lineLeft.style.top = cursorY + "px";
    this.lineLeft.style.width = Math.max(0, rect.left) + "px";

    // Right line: from element right to viewport right, at cursorY
    this.lineRight.style.left = rect.right + "px";
    this.lineRight.style.top = cursorY + "px";
    this.lineRight.style.width = Math.max(0, window.innerWidth - rect.right) + "px";
  }

  /** Hide all crosshair lines */
  hideCrosshair() {
    this.crosshairEl.style.display = "none";
    this.lastHighlightRect = null;
  }

  /** Flash a toast notification */
  toast(message: string, duration = 2000) {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);

    this.toastEl.textContent = message;
    this.toastEl.classList.add("ag-visible");

    this.toastTimeout = setTimeout(() => {
      this.toastEl.classList.remove("ag-visible");
      this.toastTimeout = null;
    }, duration);
  }

  /** Update badge text */
  setBadge(text: string) {
    this.badgeEl.textContent = text;
  }
}
