/**
 * astro-grab
 *
 * Runtime entry point. Auto-imported by the Astro integration in dev mode,
 * or import manually:
 *
 *   import { initAstroGrab } from "@omniaura/astro-grab/client";
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
let enabled = true;

// ── Key handling ─────────────────────────────────────────────────────

function isActivationKey(e: KeyboardEvent): boolean {
  switch (opts.key) {
    case "Alt":
      return e.key === "Alt" || e.key === "Option" || e.code === "AltLeft" || e.code === "AltRight";
    case "Control":
      return e.key === "Control" || e.code === "ControlLeft" || e.code === "ControlRight";
    case "Meta":
      return e.key === "Meta" || e.key === "OS" || e.code === "MetaLeft" || e.code === "MetaRight";
    case "Shift":
      return e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight";
    default:
      return e.key === "Alt" || e.key === "Option" || e.code === "AltLeft" || e.code === "AltRight";
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (!enabled) return;
  if (!isActivationKey(e)) return;

  stateMachine.transition("targeting");
  emitStateChange("targeting");
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
  emitStateChange("idle");
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
    emitStateChange("idle");
    document.body.style.cursor = "";
    hoveredEl = null;
  }
}

// ── Toolbar communication ────────────────────────────────────────────

function emitStateChange(state: string) {
  window.dispatchEvent(
    new CustomEvent("astro-grab:state-change", { detail: { state } })
  );
}

function onToolbarToggle(e: Event) {
  const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
  if (!detail) return;

  enabled = detail.enabled;

  if (!enabled) {
    // Transition to idle and remove active state
    if (stateMachine.getState() !== "idle") {
      stateMachine.transition("idle");
      emitStateChange("idle");
      overlay.clearHighlight();
      overlay.setBadge("\u26A1 astro-grab");
      document.body.style.cursor = "";
      hoveredEl = null;
    }
  }
}

function onToolbarConfigUpdate(e: Event) {
  const detail = (e as CustomEvent<{ key?: string }>).detail;
  if (!detail?.key) return;

  const validKeys = ["Alt", "Control", "Meta", "Shift"];
  if (!validKeys.includes(detail.key)) return;

  opts.key = detail.key as "Alt" | "Control" | "Meta" | "Shift";

  // If currently targeting, transition back to idle since the key changed
  if (stateMachine.getState() === "targeting") {
    stateMachine.transition("idle");
    emitStateChange("idle");
    overlay.clearHighlight();
    overlay.setBadge("\u26A1 astro-grab");
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
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("blur", onBlur);

  // Listen for toolbar CustomEvents
  window.addEventListener("astro-grab:toggle", onToolbarToggle);
  window.addEventListener("astro-grab:config-update", onToolbarConfigUpdate);

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

  window.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("keyup", onKeyUp, true);
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("mousedown", onMouseDown, true);
  document.removeEventListener("click", onClick, true);
  window.removeEventListener("blur", onBlur);
  window.removeEventListener("astro-grab:toggle", onToolbarToggle);
  window.removeEventListener("astro-grab:config-update", onToolbarConfigUpdate);

  stateMachine.reset();
  overlay.unmount();
  bridge?.disconnect();
  bridge = null;
  enabled = true;
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
