import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Overlay } from "../src/overlay.js";

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

    it("removes elements from DOM on unmount", () => {
      overlay.mount();
      overlay.unmount();

      expect(document.querySelector(".astro-grab-overlay")).toBeNull();
      expect(document.querySelector(".astro-grab-tooltip")).toBeNull();
      expect(document.querySelector(".astro-grab-toast")).toBeNull();
      expect(document.querySelector(".astro-grab-badge")).toBeNull();
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
});
