/**
 * overlay.ts
 *
 * Renders the hover-highlight overlay, tooltip, and selection UI.
 * All DOM is created with raw DOM manipulation to avoid interfering
 * with the app being inspected.
 */

import type { SourceLocation } from "./types.js";

// ── Styles ───────────────────────────────────────────────────────────

const OVERLAY_STYLES = `
  .astro-grab-overlay {
    position: fixed;
    pointer-events: none;
    z-index: 2147483647;
    border: 2px solid #bc52ee;
    background: rgba(188, 82, 238, 0.08);
    border-radius: 3px;
    transition: all 0.08s ease-out;
  }

  .astro-grab-tooltip {
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 12px;
    line-height: 1.4;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid rgba(188, 82, 238, 0.4);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    max-width: 480px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .astro-grab-tooltip .ag-component {
    color: #d8b4fe;
    font-weight: 600;
  }

  .astro-grab-tooltip .ag-file {
    color: #c4b5fd;
    opacity: 0.85;
  }

  .astro-grab-tooltip .ag-tag {
    color: #86efac;
  }

  .astro-grab-toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    z-index: 2147483647;
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    padding: 10px 18px;
    border-radius: 8px;
    border: 1px solid rgba(188, 82, 238, 0.3);
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
    background: #1a1a2e;
    color: #d8b4fe;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid rgba(188, 82, 238, 0.25);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    cursor: default;
    user-select: none;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .astro-grab-badge:hover { opacity: 1; }
`;

// ── Overlay class ────────────────────────────────────────────────────

export class Overlay {
  private styleEl: HTMLStyleElement;
  private overlayEl: HTMLDivElement;
  private tooltipEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private badgeEl: HTMLDivElement;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private _mounted = false;

  constructor() {
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = OVERLAY_STYLES;

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
  }

  mount() {
    if (this._mounted) return;
    this._mounted = true;

    document.head.appendChild(this.styleEl);
    document.body.appendChild(this.overlayEl);
    document.body.appendChild(this.tooltipEl);
    document.body.appendChild(this.toastEl);
    document.body.appendChild(this.badgeEl);
  }

  unmount() {
    if (!this._mounted) return;
    this._mounted = false;

    this.styleEl.remove();
    this.overlayEl.remove();
    this.tooltipEl.remove();
    this.toastEl.remove();
    this.badgeEl.remove();
  }

  /** Position the overlay highlight over a target element */
  highlight(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
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
