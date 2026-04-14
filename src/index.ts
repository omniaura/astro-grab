/**
 * astro-grab
 *
 * Runtime entry point. Auto-imported by the Astro integration in dev mode,
 * or import manually:
 *
 *   import { initAstroGrab } from "astro-grab";
 *   initAstroGrab({ key: "Alt", agentUrl: "ws://localhost:4567" });
 */

import { Overlay } from "./overlay.js";
import { inspect, findNearestSource, findNearestComponent, fetchSnippet, formatContext } from "./inspector.js";
import { AgentBridge } from "./agent-bridge.js";
import { StateMachine } from "./state-machine.js";
import type { AstroGrabOptions, GrabbedContext } from "./types.js";

export type { AstroGrabOptions, GrabbedContext, SourceLocation, ComponentInfo, SnippetResponse } from "./types.js";
export { inspect, fetchSnippet } from "./inspector.js";
export { StateMachine } from "./state-machine.js";
export type { ClientState, StateListener } from "./state-machine.js";

// ── State ────────────────────────────────────────────────────────────

let initialized = false;
let overlay: Overlay;
let bridge: AgentBridge | null = null;
let stateMachine: StateMachine;
let opts: Required<Omit<AstroGrabOptions, "onGrab" | "agentUrl">> & Pick<AstroGrabOptions, "onGrab" | "agentUrl">;

let hoveredEl: HTMLElement | null = null;

// ── Key handling ─────────────────────────────────────────────────────

function isActivationKey(e: KeyboardEvent): boolean {
  switch (opts.key) {
    case "Alt": return e.key === "Alt";
    case "Control": return e.key === "Control";
    case "Meta": return e.key === "Meta";
    case "Shift": return e.key === "Shift";
    default: return e.key === "Alt";
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (!isActivationKey(e)) return;

  stateMachine.transition("targeting");
  overlay.setBadge(`\u26A1 astro-grab [${opts.key}]`);
  document.body.style.cursor = "crosshair";

  // If already hovering over something, highlight it
  if (hoveredEl) {
    highlightElement(hoveredEl);
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (!isActivationKey(e)) return;

  stateMachine.transition("idle");
  overlay.setBadge("\u26A1 astro-grab");
  document.body.style.cursor = "";
  hoveredEl = null;
}

// ── Mouse handling ───────────────────────────────────────────────────

function findGrabbableTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;

  // Skip our own overlay elements
  if (
    target.classList.contains("astro-grab-overlay") ||
    target.classList.contains("astro-grab-tooltip") ||
    target.classList.contains("astro-grab-toast") ||
    target.classList.contains("astro-grab-badge")
  ) {
    return null;
  }

  return target;
}

function highlightElement(el: HTMLElement) {
  overlay.highlight(el);
  const source = findNearestSource(el);
  const component = findNearestComponent(el);
  overlay.showTooltip(el, source, component);
}

function onMouseMove(e: MouseEvent) {
  if (stateMachine.getState() !== "targeting") return;

  const target = findGrabbableTarget(e.target);
  if (!target) return;

  hoveredEl = target;
  highlightElement(target);
  overlay.updateCrosshair(e.clientX, e.clientY);
}

async function onMouseDown(e: MouseEvent) {
  if (stateMachine.getState() !== "targeting") return;

  const target = findGrabbableTarget(e.target);
  if (!target) return;

  // Prevent default behavior (text selection, link navigation, etc.)
  e.preventDefault();
  e.stopPropagation();

  // Inspect the element
  const context = inspect(target);

  // Attempt to fetch a source snippet from the dev server
  if (context.elementSource) {
    const sourceAttr = `${context.elementSource.file}:${context.elementSource.line}:${context.elementSource.column}`;
    const snippet = await fetchSnippet(sourceAttr);
    if (snippet) {
      context.snippet = snippet;
      // Re-format with the snippet included
      context.formatted = formatContext(context);
    }
  }

  // Fire callback
  const shouldCopy = opts.onGrab?.(context) !== false;

  // Copy to clipboard
  if (shouldCopy) {
    copyToClipboard(context.formatted);
  }

  // Send to agent bridge
  if (bridge?.connected) {
    bridge.send(context);
    overlay.toast("\u2713 Sent to agent", 1500);
  } else if (shouldCopy && opts.showToast) {
    overlay.toast("\u2713 Copied to clipboard", 1500);
  }

  // Flash the overlay for visual feedback
  overlay.clearHighlight();
}

function onClick(e: MouseEvent) {
  if (stateMachine.getState() !== "targeting") return;

  // Block clicks on the underlying page while grabbing
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

// ── Clipboard ────────────────────────────────────────────────────────

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for non-HTTPS or restricted contexts
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

// ── Blur handling (key release when window loses focus) ──────────────

function onBlur() {
  if (stateMachine.getState() === "targeting") {
    stateMachine.transition("idle");
    document.body.style.cursor = "";
    hoveredEl = null;
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Initialize astro-grab with options.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initAstroGrab(options: AstroGrabOptions = {}) {
  if (initialized) return;
  initialized = true;

  opts = {
    key: options.key ?? "Alt",
    showToast: options.showToast ?? true,
    onGrab: options.onGrab,
    agentUrl: options.agentUrl,
  };

  // Create state machine and overlay
  stateMachine = new StateMachine();
  overlay = new Overlay();
  overlay.connectStateMachine(stateMachine);

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
}

function bootstrap() {
  overlay.mount();

  // Set up event listeners
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("blur", onBlur);

  // Connect agent bridge if URL provided
  if (opts.agentUrl) {
    bridge = new AgentBridge(opts.agentUrl);
    bridge.connect();
  }

  console.log(
    `%c\u26A1 astro-grab%c Hold ${opts.key} + click to grab element context`,
    "color: #d8b4fe; font-weight: bold",
    "color: inherit"
  );
}

/**
 * Tear down astro-grab (for HMR / cleanup).
 */
export function destroyAstroGrab() {
  if (!initialized) return;
  initialized = false;

  document.removeEventListener("keydown", onKeyDown, true);
  document.removeEventListener("keyup", onKeyUp, true);
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("mousedown", onMouseDown, true);
  document.removeEventListener("click", onClick, true);
  window.removeEventListener("blur", onBlur);

  stateMachine.reset();
  overlay.unmount();
  bridge?.disconnect();
  bridge = null;
  document.body.style.cursor = "";
}

// ── Auto-init on import ──────────────────────────────────────────────
// Deferred to a microtask so that named importers can call
// initAstroGrab({ key: ... }) synchronously before the default init.

queueMicrotask(() => {
  if (!initialized) initAstroGrab();
});

// ── Expose global API for extensibility ──────────────────────────────

declare global {
  interface Window {
    __ASTRO_GRAB__: {
      init: typeof initAstroGrab;
      destroy: typeof destroyAstroGrab;
      inspect: typeof inspect;
    };
  }
}

if (typeof window !== "undefined") {
  window.__ASTRO_GRAB__ = {
    init: initAstroGrab,
    destroy: destroyAstroGrab,
    inspect,
  };
}
