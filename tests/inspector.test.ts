import { describe, it, expect, beforeEach } from "bun:test";
import {
  parseSourceAttr,
  findNearestSource,
  getElementSource,
  findNearestComponent,
  getComponentChain,
  formatContext,
  inspect,
} from "../src/inspector.js";
import { ATTR_SOURCE, ATTR_COMPONENT } from "../src/types.js";

describe("parseSourceAttr", () => {
  it("parses file:line:col format", () => {
    const result = parseSourceAttr("src/App.astro:42:8");
    expect(result).toEqual({ file: "src/App.astro", line: 42, column: 8 });
  });

  it("handles Windows paths with colons", () => {
    const result = parseSourceAttr("C:\\project\\App.tsx:10:5");
    expect(result).toEqual({ file: "C:\\project\\App.tsx", line: 10, column: 5 });
  });

  it("returns null for null input", () => {
    expect(parseSourceAttr(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSourceAttr("")).toBeNull();
  });

  it("returns null for invalid format (missing parts)", () => {
    expect(parseSourceAttr("src/App.astro")).toBeNull();
    expect(parseSourceAttr("src/App.astro:42")).toBeNull();
  });

  it("returns null for non-numeric line/col", () => {
    expect(parseSourceAttr("file:abc:def")).toBeNull();
  });
});

describe("DOM walking", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  describe("findNearestSource", () => {
    it("finds source on the element itself", () => {
      const el = document.createElement("button");
      el.setAttribute(ATTR_SOURCE, "src/Button.astro:5:3");
      root.appendChild(el);

      const result = findNearestSource(el);
      expect(result).toEqual({ file: "src/Button.astro", line: 5, column: 3 });
    });

    it("walks up to find source on parent", () => {
      const parent = document.createElement("div");
      parent.setAttribute(ATTR_SOURCE, "src/Card.astro:10:1");
      const child = document.createElement("span");
      parent.appendChild(child);
      root.appendChild(parent);

      const result = findNearestSource(child);
      expect(result).toEqual({ file: "src/Card.astro", line: 10, column: 1 });
    });

    it("returns null when no source found", () => {
      const el = document.createElement("div");
      root.appendChild(el);
      expect(findNearestSource(el)).toBeNull();
    });
  });

  describe("getElementSource", () => {
    it("returns source only on the element itself", () => {
      const parent = document.createElement("div");
      parent.setAttribute(ATTR_SOURCE, "src/Parent.astro:1:1");
      const child = document.createElement("span");
      parent.appendChild(child);
      root.appendChild(parent);

      expect(getElementSource(child)).toBeNull();
      expect(getElementSource(parent)).toEqual({
        file: "src/Parent.astro",
        line: 1,
        column: 1,
      });
    });
  });

  describe("findNearestComponent", () => {
    it("finds component name on the element", () => {
      const el = document.createElement("div");
      el.setAttribute(ATTR_COMPONENT, "Header");
      root.appendChild(el);

      expect(findNearestComponent(el)).toBe("Header");
    });

    it("walks up to find component name", () => {
      const parent = document.createElement("div");
      parent.setAttribute(ATTR_COMPONENT, "Layout");
      const child = document.createElement("nav");
      parent.appendChild(child);
      root.appendChild(parent);

      expect(findNearestComponent(child)).toBe("Layout");
    });

    it("returns null when no component found", () => {
      const el = document.createElement("div");
      root.appendChild(el);
      expect(findNearestComponent(el)).toBeNull();
    });
  });

  describe("getComponentChain", () => {
    it("collects ancestry chain innermost first", () => {
      const outer = document.createElement("div");
      outer.setAttribute(ATTR_COMPONENT, "Layout");
      outer.setAttribute(ATTR_SOURCE, "src/Layout.astro:1:1");

      const inner = document.createElement("div");
      inner.setAttribute(ATTR_COMPONENT, "Card");
      inner.setAttribute(ATTR_SOURCE, "src/Card.astro:5:3");

      const target = document.createElement("button");

      inner.appendChild(target);
      outer.appendChild(inner);
      root.appendChild(outer);

      const chain = getComponentChain(target);
      expect(chain).toHaveLength(2);
      expect(chain[0]!.name).toBe("Card");
      expect(chain[1]!.name).toBe("Layout");
    });

    it("deduplicates consecutive identical components", () => {
      const wrapper1 = document.createElement("div");
      wrapper1.setAttribute(ATTR_COMPONENT, "Card");
      wrapper1.setAttribute(ATTR_SOURCE, "src/Card.astro:5:3");

      const wrapper2 = document.createElement("div");
      wrapper2.setAttribute(ATTR_COMPONENT, "Card");
      wrapper2.setAttribute(ATTR_SOURCE, "src/Card.astro:5:3");

      const target = document.createElement("span");

      wrapper2.appendChild(target);
      wrapper1.appendChild(wrapper2);
      root.appendChild(wrapper1);

      const chain = getComponentChain(target);
      expect(chain).toHaveLength(1);
      expect(chain[0]!.name).toBe("Card");
    });
  });

  describe("formatContext", () => {
    it("formats a basic context with element and source", () => {
      const el = document.createElement("button");
      el.className = "btn primary";

      const output = formatContext({
        element: el,
        tagName: "button",
        elementSource: { file: "src/App.astro", line: 24, column: 8 },
        components: [],
        timestamp: Date.now(),
      });

      expect(output).toContain("--- astro-grab context ---");
      expect(output).toContain("Element: <button class=\"btn primary\">");
      expect(output).toContain("Source:  src/App.astro:24:8");
      expect(output).toContain("--- end astro-grab context ---");
    });

    it("includes component tree when present", () => {
      const el = document.createElement("div");

      const output = formatContext({
        element: el,
        tagName: "div",
        elementSource: null,
        components: [
          { name: "Card", location: { file: "src/Card.astro", line: 5, column: 1 } },
          { name: "Layout", location: { file: "src/Layout.astro", line: 1, column: 1 } },
        ],
        timestamp: Date.now(),
      });

      expect(output).toContain("Component tree");
      expect(output).toContain("<Card />");
      expect(output).toContain("<Layout />");
    });
  });

  describe("inspect", () => {
    it("returns a full GrabbedContext", () => {
      const el = document.createElement("button");
      el.setAttribute(ATTR_SOURCE, "src/Button.astro:10:5");
      el.textContent = "Click me";
      root.appendChild(el);

      const ctx = inspect(el);

      expect(ctx.tagName).toBe("button");
      expect(ctx.elementSource).toEqual({ file: "src/Button.astro", line: 10, column: 5 });
      expect(ctx.formatted).toContain("astro-grab context");
      expect(ctx.timestamp).toBeGreaterThan(0);
    });
  });
});
