/**
 * keybinding.test.ts
 *
 * Tests the keyboard activation logic from src/index.ts.
 * Uses initAstroGrab / destroyAstroGrab to set up and tear down
 * the full event listener pipeline, then dispatches KeyboardEvents
 * to verify state transitions.
 *
 * We observe side effects via:
 *   - window CustomEvent "astro-grab:state-change" (emitted on transition)
 *   - document.body.style.cursor ("crosshair" when targeting, "" when idle)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initAstroGrab, destroyAstroGrab } from "../src/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Collect state-change events emitted by astro-grab. */
function trackStateChanges(): { states: string[]; cleanup: () => void } {
  const states: string[] = [];
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ state: string }>).detail;
    if (detail?.state) states.push(detail.state);
  };
  window.addEventListener("astro-grab:state-change", handler);
  return {
    states,
    cleanup: () => window.removeEventListener("astro-grab:state-change", handler),
  };
}

function fireKeyDown(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, ...opts });
  window.dispatchEvent(event);
}

function fireKeyUp(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keyup", { key, bubbles: true, ...opts });
  window.dispatchEvent(event);
}

function fireBlur() {
  window.dispatchEvent(new Event("blur"));
}

function fireMouseMove(x: number, y: number) {
  const event = new MouseEvent("mousemove", {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  document.dispatchEvent(event);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Keybinding activation", () => {
  let tracker: ReturnType<typeof trackStateChanges>;

  beforeEach(async () => {
    // The module auto-inits via queueMicrotask on import.
    // Flush that microtask, then destroy so we start clean.
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    destroyAstroGrab();
    document.body.style.cursor = "";
    tracker = trackStateChanges();
  });

  afterEach(() => {
    tracker.cleanup();
    destroyAstroGrab();
    document.body.style.cursor = "";
  });

  // ── Default activation key (Alt) ─────────────────────────────────────

  describe("default key (Alt)", () => {
    it("transitions to targeting when Alt is pressed", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyDown("Alt");

      expect(tracker.states).toContain("targeting");
      expect(document.body.style.cursor).toBe("crosshair");
    });

    it("transitions back to idle when Alt is released", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyDown("Alt");
      fireKeyUp("Alt");

      expect(tracker.states).toEqual(["targeting", "idle"]);
      expect(document.body.style.cursor).toBe("");
    });

    it("wrong key does not trigger targeting", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyDown("a");

      expect(tracker.states).toEqual([]);
      expect(document.body.style.cursor).toBe("");
    });

    it("releasing a non-activation key while idle is a no-op", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyUp("a");

      expect(tracker.states).toEqual([]);
    });

    it("matches Alt by keyboard code as well as key string", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyDown("Option", { code: "AltLeft" });

      expect(tracker.states).toContain("targeting");
      expect(document.body.style.cursor).toBe("crosshair");
    });
  });

  // ── Different activation keys ─────────────────────────────────────────

  describe("configurable activation keys", () => {
    it("Control key activates targeting", () => {
      initAstroGrab({ key: "Control" });
      fireKeyDown("Control");

      expect(tracker.states).toContain("targeting");
    });

    it("Meta key activates targeting", () => {
      initAstroGrab({ key: "Meta" });
      fireKeyDown("Meta");

      expect(tracker.states).toContain("targeting");
    });

    it("Shift key activates targeting", () => {
      initAstroGrab({ key: "Shift" });
      fireKeyDown("Shift");

      expect(tracker.states).toContain("targeting");
    });

    it("Alt does not activate when key is configured as Control", () => {
      initAstroGrab({ key: "Control" });
      fireKeyDown("Alt");

      expect(tracker.states).toEqual([]);
    });

    it("Control does not activate when key is configured as Meta", () => {
      initAstroGrab({ key: "Meta" });
      fireKeyDown("Control");

      expect(tracker.states).toEqual([]);
    });
  });

  // ── Escape key ────────────────────────────────────────────────────────

  describe("Escape key", () => {
    it("does not affect idle state", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyDown("Escape");

      expect(tracker.states).toEqual([]);
      expect(document.body.style.cursor).toBe("");
    });
  });

  // ── Blur (window loses focus) ─────────────────────────────────────────

  describe("blur event", () => {
    it("transitions to idle when window loses focus during targeting", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyDown("Alt");
      expect(tracker.states).toContain("targeting");

      fireBlur();

      expect(tracker.states).toEqual(["targeting", "idle"]);
      expect(document.body.style.cursor).toBe("");
    });

    it("is a no-op when already idle", () => {
      initAstroGrab({ key: "Alt" });
      fireBlur();

      expect(tracker.states).toEqual([]);
    });
  });

  // ── Mouse events during non-targeting state ───────────────────────────

  describe("mouse events when idle", () => {
    it("mousemove during idle does not change state", () => {
      initAstroGrab({ key: "Alt" });
      fireMouseMove(100, 200);

      expect(tracker.states).toEqual([]);
    });
  });

  // ── Multiple init calls ───────────────────────────────────────────────

  describe("multiple init/destroy cycles", () => {
    it("second initAstroGrab call is a no-op", () => {
      initAstroGrab({ key: "Alt" });
      initAstroGrab({ key: "Control" }); // should be ignored

      // Alt should still be the activation key
      fireKeyDown("Alt");
      expect(tracker.states).toContain("targeting");
    });

    it("can re-initialize after destroy", () => {
      initAstroGrab({ key: "Alt" });
      destroyAstroGrab();
      tracker.states.length = 0;

      initAstroGrab({ key: "Control" });
      fireKeyDown("Control");

      expect(tracker.states).toContain("targeting");
    });

    it("keydown after destroy is a no-op", () => {
      initAstroGrab({ key: "Alt" });
      destroyAstroGrab();
      tracker.states.length = 0;

      fireKeyDown("Alt");

      expect(tracker.states).toEqual([]);
    });
  });

  // ── Toolbar toggle event ──────────────────────────────────────────────

  describe("toolbar toggle", () => {
    it("disabling via toggle prevents activation", () => {
      initAstroGrab({ key: "Alt" });

      // Disable via toolbar event
      window.dispatchEvent(
        new CustomEvent("astro-grab:toggle", { detail: { enabled: false } }),
      );

      fireKeyDown("Alt");
      // Should not have transitioned since we're disabled
      expect(tracker.states).toEqual([]);
    });

    it("re-enabling via toggle allows activation again", () => {
      initAstroGrab({ key: "Alt" });

      window.dispatchEvent(
        new CustomEvent("astro-grab:toggle", { detail: { enabled: false } }),
      );
      window.dispatchEvent(
        new CustomEvent("astro-grab:toggle", { detail: { enabled: true } }),
      );

      fireKeyDown("Alt");
      expect(tracker.states).toContain("targeting");
    });

    it("disabling while targeting transitions to idle", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyDown("Alt");
      expect(tracker.states).toContain("targeting");

      window.dispatchEvent(
        new CustomEvent("astro-grab:toggle", { detail: { enabled: false } }),
      );

      expect(tracker.states).toContain("idle");
    });
  });

  // ── Toolbar config update ─────────────────────────────────────────────

  describe("toolbar config update", () => {
    it("changes the activation key at runtime", () => {
      initAstroGrab({ key: "Alt" });

      // Update key via toolbar event
      window.dispatchEvent(
        new CustomEvent("astro-grab:config-update", { detail: { key: "Shift" } }),
      );

      // Old key should no longer work
      fireKeyDown("Alt");
      expect(tracker.states).toEqual([]);

      // New key should work
      fireKeyDown("Shift");
      expect(tracker.states).toContain("targeting");
    });

    it("transitions to idle if currently targeting when key changes", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyDown("Alt");
      expect(tracker.states).toContain("targeting");

      window.dispatchEvent(
        new CustomEvent("astro-grab:config-update", { detail: { key: "Control" } }),
      );

      expect(tracker.states).toContain("idle");
    });

    it("ignores invalid key values", () => {
      initAstroGrab({ key: "Alt" });

      window.dispatchEvent(
        new CustomEvent("astro-grab:config-update", { detail: { key: "InvalidKey" } }),
      );

      // Alt should still work since the update was ignored
      fireKeyDown("Alt");
      expect(tracker.states).toContain("targeting");
    });

    it("ignores config update with no key", () => {
      initAstroGrab({ key: "Alt" });

      window.dispatchEvent(
        new CustomEvent("astro-grab:config-update", { detail: {} }),
      );

      fireKeyDown("Alt");
      expect(tracker.states).toContain("targeting");
    });
  });

  // ── Repeated transitions ──────────────────────────────────────────────

  describe("repeated transitions", () => {
    it("pressing the activation key while already targeting emits state again", () => {
      initAstroGrab({ key: "Alt" });
      fireKeyDown("Alt");
      expect(tracker.states).toEqual(["targeting"]);

      // Second keydown while already targeting — the onKeyDown handler
      // emits the state-change CustomEvent unconditionally (even though
      // the state machine internally deduplicates).
      fireKeyDown("Alt");
      expect(tracker.states).toEqual(["targeting", "targeting"]);
    });

    it("full activation cycle can be repeated", () => {
      initAstroGrab({ key: "Alt" });

      fireKeyDown("Alt");
      fireKeyUp("Alt");
      fireKeyDown("Alt");
      fireKeyUp("Alt");

      expect(tracker.states).toEqual(["targeting", "idle", "targeting", "idle"]);
    });
  });

  // ── showToast option ──────────────────────────────────────────────────

  describe("showToast option", () => {
    it("initializes with showToast true by default", () => {
      // Just verify it doesn't throw — the toast behavior is tested in overlay tests
      expect(() => initAstroGrab()).not.toThrow();
    });

    it("initializes with showToast false", () => {
      expect(() => initAstroGrab({ showToast: false })).not.toThrow();
    });
  });
});
