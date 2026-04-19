import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Overlay } from "../src/overlay.js";
import { StateMachine } from "../src/state-machine.js";

describe("Overlay", () => {
  let overlay: Overlay;

  beforeEach(() => {
    overlay = new Overlay();
  });

  afterEach(() => {
    overlay.unmount();
  });

  describe("mount/unmount", () => {
    it("appends elements to the DOM on mount", () => {
      overlay.mount();

      expect(document.querySelector(".astro-grab-overlay")).not.toBeNull();
      expect(document.querySelector(".astro-grab-tooltip")).not.toBeNull();
      expect(document.querySelector(".astro-grab-toast")).not.toBeNull();
      expect(document.querySelector(".astro-grab-badge")).not.toBeNull();
    });

    it("appends crosshair elements on mount", () => {
      overlay.mount();

      const crosshair = document.querySelector(".astro-grab-crosshair");
      expect(crosshair).not.toBeNull();

      const lines = crosshair!.querySelectorAll(".astro-grab-crosshair-line");
      expect(lines.length).toBe(4);

      // 2 vertical lines, 2 horizontal lines
      const verticals = crosshair!.querySelectorAll(".ag-crosshair-v");
      const horizontals = crosshair!.querySelectorAll(".ag-crosshair-h");
      expect(verticals.length).toBe(2);
      expect(horizontals.length).toBe(2);
    });

    it("removes elements from DOM on unmount", () => {
      overlay.mount();
      overlay.unmount();

      expect(document.querySelector(".astro-grab-overlay")).toBeNull();
      expect(document.querySelector(".astro-grab-tooltip")).toBeNull();
      expect(document.querySelector(".astro-grab-toast")).toBeNull();
      expect(document.querySelector(".astro-grab-badge")).toBeNull();
      expect(document.querySelector(".astro-grab-crosshair")).toBeNull();
    });

    it("is safe to call mount twice", () => {
      overlay.mount();
      overlay.mount();

      const badges = document.querySelectorAll(".astro-grab-badge");
      expect(badges.length).toBe(1);
    });

    it("is safe to call unmount without mount", () => {
      expect(() => overlay.unmount()).not.toThrow();
    });

    it("injects theme styles using overrides while preserving defaults", () => {
      overlay = new Overlay({
        accent: "#00ffaa",
        surface: "#101010",
      });
      overlay.mount();

      const styleEl = document.head.querySelector("style");
      expect(styleEl?.textContent).toContain("#00ffaa");
      expect(styleEl?.textContent).toContain("#101010");
      expect(styleEl?.textContent).toContain("rgba(188, 82, 238, 0.08)");
    });
  });

  describe("highlight", () => {
    it("shows the overlay element", () => {
      overlay.mount();
      const el = document.createElement("div");
      document.body.appendChild(el);

      overlay.highlight(el);

      const overlayEl = document.querySelector(".astro-grab-overlay") as HTMLDivElement;
      expect(overlayEl.style.display).toBe("block");
    });
  });

  describe("clearHighlight", () => {
    it("hides overlay and tooltip", () => {
      overlay.mount();
      overlay.clearHighlight();

      const overlayEl = document.querySelector(".astro-grab-overlay") as HTMLDivElement;
      const tooltipEl = document.querySelector(".astro-grab-tooltip") as HTMLDivElement;
      expect(overlayEl.style.display).toBe("none");
      expect(tooltipEl.style.display).toBe("none");
    });
  });

  describe("setBadge", () => {
    it("updates badge text", () => {
      overlay.mount();
      overlay.setBadge("test badge");

      const badge = document.querySelector(".astro-grab-badge");
      expect(badge?.textContent).toBe("test badge");
    });
  });

  describe("toast", () => {
    it("shows toast with message", () => {
      overlay.mount();
      overlay.toast("Test message");

      const toast = document.querySelector(".astro-grab-toast");
      expect(toast?.textContent).toBe("Test message");
      expect(toast?.classList.contains("ag-visible")).toBe(true);
    });
  });

  describe("crosshair", () => {
    it("crosshair container is hidden by default via CSS", () => {
      overlay.mount();

      // The crosshair is hidden via the stylesheet class (display: none in CSS),
      // not inline style. Verify the element exists with the correct class.
      const crosshair = document.querySelector(".astro-grab-crosshair") as HTMLDivElement;
      expect(crosshair).not.toBeNull();
      expect(crosshair.className).toBe("astro-grab-crosshair");
    });

    it("updateCrosshair positions lines when a highlight rect exists", () => {
      overlay.mount();

      // Highlight an element to set lastHighlightRect
      const el = document.createElement("div");
      document.body.appendChild(el);
      overlay.highlight(el);

      // Call updateCrosshair with a cursor position
      overlay.updateCrosshair(150, 200);

      const crosshair = document.querySelector(".astro-grab-crosshair") as HTMLDivElement;
      const lines = crosshair.querySelectorAll(".astro-grab-crosshair-line");

      // Top vertical line should be positioned at cursorX
      const lineTop = lines[0] as HTMLDivElement;
      expect(lineTop.style.left).toBe("150px");
      expect(lineTop.style.top).toBe("0px");

      // Bottom vertical line should be positioned at cursorX
      const lineBottom = lines[1] as HTMLDivElement;
      expect(lineBottom.style.left).toBe("150px");

      // Left horizontal line should be positioned at cursorY
      const lineLeft = lines[2] as HTMLDivElement;
      expect(lineLeft.style.top).toBe("200px");
      expect(lineLeft.style.left).toBe("0px");

      // Right horizontal line should be positioned at cursorY
      const lineRight = lines[3] as HTMLDivElement;
      expect(lineRight.style.top).toBe("200px");
    });

    it("updateCrosshair hides crosshair when no highlight rect exists", () => {
      overlay.mount();

      // Show crosshair manually to verify it gets hidden
      const crosshair = document.querySelector(".astro-grab-crosshair") as HTMLDivElement;
      crosshair.style.display = "block";

      // No element has been highlighted, so updateCrosshair should hide
      overlay.updateCrosshair(100, 100);

      expect(crosshair.style.display).toBe("none");
    });

    it("hideCrosshair hides the crosshair container", () => {
      overlay.mount();

      const crosshair = document.querySelector(".astro-grab-crosshair") as HTMLDivElement;
      crosshair.style.display = "block";

      overlay.hideCrosshair();

      expect(crosshair.style.display).toBe("none");
    });

    it("crosshair is hidden when state transitions to idle", () => {
      overlay.mount();

      const sm = new StateMachine();
      overlay.connectStateMachine(sm);

      // Transition to targeting — crosshair becomes visible
      sm.transition("targeting");
      const crosshair = document.querySelector(".astro-grab-crosshair") as HTMLDivElement;
      expect(crosshair.style.display).toBe("block");

      // Transition back to idle — crosshair should be hidden
      sm.transition("idle");
      expect(crosshair.style.display).toBe("none");
    });

    it("crosshair becomes visible when state transitions to targeting", () => {
      overlay.mount();

      const sm = new StateMachine();
      overlay.connectStateMachine(sm);

      sm.transition("targeting");

      const crosshair = document.querySelector(".astro-grab-crosshair") as HTMLDivElement;
      expect(crosshair.style.display).toBe("block");
    });
  });
});
