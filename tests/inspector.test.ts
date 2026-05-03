import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  parseSourceAttr,
  findNearestSource,
  getElementSource,
  findNearestComponent,
  getComponentChain,
  formatContext,
  interpolateTemplate,
  inspect,
  fetchSnippet,
} from "../src/inspector.js";
import { ATTR_SOURCE, ATTR_COMPONENT } from "../src/types.js";
import type { SnippetResponse } from "../src/types.js";

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

  // ── New: malformed attribute values ────────────────────���────────────

  it("returns null for a single colon", () => {
    expect(parseSourceAttr(":")).toBeNull();
  });

  it("returns null for double colons with nothing else", () => {
    expect(parseSourceAttr("::")).toBeNull();
  });

  it("returns null for triple colons (empty parts)", () => {
    // ":::".split(":") = ["", "", "", ""] → file=":", line=NaN, col=NaN
    expect(parseSourceAttr(":::")).toBeNull();
  });

  it("handles extra colons in the path gracefully", () => {
    // "a:b:c:10:5".split(":") = ["a","b","c","10","5"]
    // col=5, line=10, file="a:b:c"
    const result = parseSourceAttr("a:b:c:10:5");
    expect(result).toEqual({ file: "a:b:c", line: 10, column: 5 });
  });

  it("returns null when line is NaN after parsing", () => {
    expect(parseSourceAttr("file::5")).toBeNull();
  });

  it("returns null when col is NaN after parsing", () => {
    expect(parseSourceAttr("file:5:")).toBeNull();
  });

  it("handles large line and column numbers", () => {
    const result = parseSourceAttr("file.astro:99999:8888");
    expect(result).toEqual({ file: "file.astro", line: 99999, column: 8888 });
  });

  it("handles file path with spaces", () => {
    const result = parseSourceAttr("src/my file.astro:3:2");
    expect(result).toEqual({ file: "src/my file.astro", line: 3, column: 2 });
  });
});

describe("DOM walking", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
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

    // ── New: elements with no source at all ────────────────────────────

    it("returns null for a deeply nested element with no source attributes anywhere", () => {
      const l1 = document.createElement("div");
      const l2 = document.createElement("section");
      const l3 = document.createElement("article");
      const l4 = document.createElement("p");
      const l5 = document.createElement("span");

      l4.appendChild(l5);
      l3.appendChild(l4);
      l2.appendChild(l3);
      l1.appendChild(l2);
      root.appendChild(l1);

      expect(findNearestSource(l5)).toBeNull();
    });

    it("returns null when the nearest element has a malformed source attribute", () => {
      const parent = document.createElement("div");
      parent.setAttribute(ATTR_SOURCE, "src/Good.astro:10:1");
      const child = document.createElement("span");
      child.setAttribute(ATTR_SOURCE, "malformed-no-colons");
      parent.appendChild(child);
      root.appendChild(parent);

      // findNearestSource stops at the first element that HAS the attribute,
      // and parseSourceAttr returns null for the malformed value. It does
      // NOT continue walking up to the parent.
      const result = findNearestSource(child);
      expect(result).toBeNull();
    });

    it("prefers the closest ancestor with valid source", () => {
      const grandparent = document.createElement("div");
      grandparent.setAttribute(ATTR_SOURCE, "src/Layout.astro:1:1");

      const parent = document.createElement("div");
      parent.setAttribute(ATTR_SOURCE, "src/Card.astro:5:3");

      const child = document.createElement("span");

      parent.appendChild(child);
      grandparent.appendChild(parent);
      root.appendChild(grandparent);

      const result = findNearestSource(child);
      expect(result).toEqual({ file: "src/Card.astro", line: 5, column: 3 });
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

    it("returns null for malformed source on the element", () => {
      const el = document.createElement("div");
      el.setAttribute(ATTR_SOURCE, "just-a-file");
      root.appendChild(el);

      expect(getElementSource(el)).toBeNull();
    });

    it("returns null for empty source attribute", () => {
      const el = document.createElement("div");
      el.setAttribute(ATTR_SOURCE, "");
      root.appendChild(el);

      expect(getElementSource(el)).toBeNull();
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

    // ── New: deeply nested component chains ────────────────────────────

    it("handles 5+ levels of component nesting", () => {
      const app = document.createElement("div");
      app.setAttribute(ATTR_COMPONENT, "App");
      app.setAttribute(ATTR_SOURCE, "src/App.astro:1:1");

      const layout = document.createElement("div");
      layout.setAttribute(ATTR_COMPONENT, "Layout");
      layout.setAttribute(ATTR_SOURCE, "src/Layout.astro:1:1");

      const sidebar = document.createElement("div");
      sidebar.setAttribute(ATTR_COMPONENT, "Sidebar");
      sidebar.setAttribute(ATTR_SOURCE, "src/Sidebar.astro:1:1");

      const nav = document.createElement("div");
      nav.setAttribute(ATTR_COMPONENT, "Nav");
      nav.setAttribute(ATTR_SOURCE, "src/Nav.astro:1:1");

      const navItem = document.createElement("div");
      navItem.setAttribute(ATTR_COMPONENT, "NavItem");
      navItem.setAttribute(ATTR_SOURCE, "src/NavItem.astro:1:1");

      const icon = document.createElement("div");
      icon.setAttribute(ATTR_COMPONENT, "Icon");
      icon.setAttribute(ATTR_SOURCE, "src/Icon.astro:1:1");

      const target = document.createElement("svg");

      icon.appendChild(target);
      navItem.appendChild(icon);
      nav.appendChild(navItem);
      sidebar.appendChild(nav);
      layout.appendChild(sidebar);
      app.appendChild(layout);
      root.appendChild(app);

      const chain = getComponentChain(target);
      expect(chain).toHaveLength(6);
      expect(chain[0]!.name).toBe("Icon");
      expect(chain[1]!.name).toBe("NavItem");
      expect(chain[2]!.name).toBe("Nav");
      expect(chain[3]!.name).toBe("Sidebar");
      expect(chain[4]!.name).toBe("Layout");
      expect(chain[5]!.name).toBe("App");
    });

    it("does not deduplicate components with the same name but different source", () => {
      const first = document.createElement("div");
      first.setAttribute(ATTR_COMPONENT, "Card");
      first.setAttribute(ATTR_SOURCE, "src/Card.astro:5:3");

      const second = document.createElement("div");
      second.setAttribute(ATTR_COMPONENT, "Card");
      second.setAttribute(ATTR_SOURCE, "src/Card.astro:20:1"); // different line

      const target = document.createElement("span");

      second.appendChild(target);
      first.appendChild(second);
      root.appendChild(first);

      const chain = getComponentChain(target);
      // Same component name but different source → both should appear
      expect(chain).toHaveLength(2);
      expect(chain[0]!.location?.line).toBe(20);
      expect(chain[1]!.location?.line).toBe(5);
    });

    it("includes components without source locations", () => {
      const outer = document.createElement("div");
      outer.setAttribute(ATTR_COMPONENT, "Layout");
      // No ATTR_SOURCE on this one

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
      expect(chain[0]!.location).not.toBeNull();
      expect(chain[1]!.name).toBe("Layout");
      expect(chain[1]!.location).toBeNull();
    });

    it("returns empty array when no component ancestors exist", () => {
      const el = document.createElement("div");
      root.appendChild(el);

      const chain = getComponentChain(el);
      expect(chain).toEqual([]);
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
      expect(output).toContain('Element: <button class="btn primary">');
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

    // ── New: formatContext with snippet data ──────────────────────────────

    it("includes source snippet when snippet data is present", () => {
      const el = document.createElement("div");

      const snippet: SnippetResponse = {
        file: "src/Page.astro",
        snippet: '<h1>Hello World</h1>\n<Card />',
        startLine: 5,
        endLine: 9,
        targetLine: 7,
        language: "astro",
      };

      const output = formatContext({
        element: el,
        tagName: "div",
        elementSource: { file: "src/Page.astro", line: 7, column: 5 },
        components: [],
        timestamp: Date.now(),
        snippet,
      });

      expect(output).toContain("Source (astro, lines 5-9):");
      expect(output).toContain("```astro");
      expect(output).toContain("<h1>Hello World</h1>");
      expect(output).toContain("<Card />");
      expect(output).toContain("```");
      // Should NOT contain "HTML:" fallback
      expect(output).not.toContain("HTML:");
    });

    it("falls back to outerHTML when no snippet data is present", () => {
      const el = document.createElement("div");
      el.innerHTML = "<p>Fallback content</p>";

      const output = formatContext({
        element: el,
        tagName: "div",
        elementSource: null,
        components: [],
        timestamp: Date.now(),
      });

      expect(output).toContain("HTML:");
      expect(output).toContain("<div><p>Fallback content</p></div>");
      // Should NOT contain fenced code block
      expect(output).not.toContain("```");
    });

    it("truncates long outerHTML to 500 chars + ellipsis", () => {
      const el = document.createElement("div");
      // Create a very long element
      el.innerHTML = "x".repeat(600);

      const output = formatContext({
        element: el,
        tagName: "div",
        elementSource: null,
        components: [],
        timestamp: Date.now(),
      });

      expect(output).toContain("HTML:");
      expect(output).toContain("...");
    });

    it("omits Source line when elementSource is null", () => {
      const el = document.createElement("span");

      const output = formatContext({
        element: el,
        tagName: "span",
        elementSource: null,
        components: [],
        timestamp: Date.now(),
      });

      expect(output).not.toContain("Source:");
      expect(output).toContain("Element: <span>");
    });

    it("includes component locations in the tree", () => {
      const el = document.createElement("div");

      const output = formatContext({
        element: el,
        tagName: "div",
        elementSource: null,
        components: [
          { name: "Card", location: { file: "src/Card.astro", line: 5, column: 1 } },
          { name: "Layout", location: null },
        ],
        timestamp: Date.now(),
      });

      // Card has a location
      expect(output).toContain("src/Card.astro:5:1");
      // Layout does NOT have a location — just the component name
      expect(output).toContain("<Layout />");
    });

    it("includes element id in summary", () => {
      const el = document.createElement("div");
      el.id = "main-content";

      const output = formatContext({
        element: el,
        tagName: "div",
        elementSource: null,
        components: [],
        timestamp: Date.now(),
      });

      expect(output).toContain('id="main-content"');
    });

    it("includes data-testid in summary", () => {
      const el = document.createElement("button");
      el.setAttribute("data-testid", "submit-btn");

      const output = formatContext({
        element: el,
        tagName: "button",
        elementSource: null,
        components: [],
        timestamp: Date.now(),
      });

      expect(output).toContain('data-testid="submit-btn"');
    });

    it("truncates long class names to 80 chars", () => {
      const el = document.createElement("div");
      el.className = "a".repeat(100);

      const output = formatContext({
        element: el,
        tagName: "div",
        elementSource: null,
        components: [],
        timestamp: Date.now(),
      });

      // The class should be truncated with ...
      expect(output).toContain('class="' + "a".repeat(77) + '..."');
    });

    it("formats a custom clipboard template with context variables", () => {
      const el = document.createElement("button");
      el.className = "btn primary";
      el.textContent = "Save";

      const output = formatContext(
        {
          element: el,
          tagName: "button",
          elementSource: { file: "src/App.astro", line: 24, column: 8 },
          components: [
            { name: "Counter", location: { file: "src/Counter.astro", line: 12, column: 1 } },
          ],
          timestamp: Date.now(),
        },
        "Tag: {{tagName}}\nFile: {{file}}\nLine: {{line}}\nSource: {{source}}\n{{components}}\n{{html}}"
      );

      expect(output).toContain("Tag: button");
      expect(output).toContain("File: src/App.astro");
      expect(output).toContain("Line: 24");
      expect(output).toContain("Source: src/App.astro:24:8");
      expect(output).toContain("<Counter /> -> src/Counter.astro:12:1");
      expect(output).toContain('<button class="btn primary">Save</button>');
    });

    it("exposes snippet variables to custom clipboard templates", () => {
      const el = document.createElement("div");
      const snippet: SnippetResponse = {
        file: "src/Page.astro",
        snippet: "<Card />",
        startLine: 5,
        endLine: 9,
        targetLine: 7,
        language: "astro",
      };

      const output = formatContext(
        {
          element: el,
          tagName: "div",
          elementSource: { file: "src/Page.astro", line: 7, column: 5 },
          components: [],
          timestamp: Date.now(),
          snippet,
        },
        "{{language}}:{{startLine}}-{{endLine}} target={{targetLine}}\n{{snippet}}"
      );

      expect(output).toBe("astro:5-9 target=7\n<Card />");
    });

    it("replaces missing template variables with empty strings", () => {
      const el = document.createElement("div");

      const output = interpolateTemplate("{{source}} {{unknown}} {{snippet}}", {
        element: el,
        tagName: "div",
        elementSource: null,
        components: [],
        timestamp: Date.now(),
      });

      expect(output).toBe("  ");
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

    it("populates components from the DOM ancestry", () => {
      const outer = document.createElement("div");
      outer.setAttribute(ATTR_COMPONENT, "Layout");
      outer.setAttribute(ATTR_SOURCE, "src/Layout.astro:1:1");

      const inner = document.createElement("div");
      inner.setAttribute(ATTR_COMPONENT, "Card");
      inner.setAttribute(ATTR_SOURCE, "src/Card.astro:5:3");

      const target = document.createElement("p");
      target.textContent = "hello";

      inner.appendChild(target);
      outer.appendChild(inner);
      root.appendChild(outer);

      const ctx = inspect(target);
      expect(ctx.components).toHaveLength(2);
      expect(ctx.components[0]!.name).toBe("Card");
      expect(ctx.components[1]!.name).toBe("Layout");
    });

    it("returns null elementSource when no source attributes in ancestry", () => {
      const el = document.createElement("div");
      root.appendChild(el);

      const ctx = inspect(el);
      expect(ctx.elementSource).toBeNull();
    });

    it("formatted output includes all the relevant parts", () => {
      const el = document.createElement("button");
      el.id = "submit";
      el.setAttribute(ATTR_SOURCE, "src/Form.astro:20:3");
      root.appendChild(el);

      const ctx = inspect(el);
      expect(ctx.formatted).toContain("--- astro-grab context ---");
      expect(ctx.formatted).toContain("--- end astro-grab context ---");
      expect(ctx.formatted).toContain("src/Form.astro:20:3");
      expect(ctx.formatted).toContain('id="submit"');
    });

    it("uses a custom template for the formatted output", () => {
      const el = document.createElement("button");
      el.setAttribute(ATTR_SOURCE, "src/Button.astro:10:5");
      root.appendChild(el);

      const ctx = inspect(el, "{{tagName}} {{source}}");

      expect(ctx.formatted).toBe("button src/Button.astro:10:5");
    });
  });
});

// ── fetchSnippet ──────────────────────────────���─────────────────────────

describe("fetchSnippet", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed SnippetResponse on success", async () => {
    const mockResponse: SnippetResponse = {
      file: "src/Page.astro",
      snippet: "<h1>Hello</h1>",
      startLine: 5,
      endLine: 9,
      targetLine: 7,
      language: "astro",
    };

    globalThis.fetch = (async () =>
      new Response(JSON.stringify(mockResponse), { status: 200 })) as typeof fetch;

    const result = await fetchSnippet("src/Page.astro:7:5");

    expect(result).not.toBeNull();
    expect(result!.file).toBe("src/Page.astro");
    expect(result!.snippet).toBe("<h1>Hello</h1>");
    expect(result!.targetLine).toBe(7);
    expect(result!.language).toBe("astro");
  });

  it("returns null on 404 response", async () => {
    globalThis.fetch = (async () =>
      new Response("Not found", { status: 404 })) as typeof fetch;

    const result = await fetchSnippet("src/Missing.astro:1:1");
    expect(result).toBeNull();
  });

  it("returns null on 500 response", async () => {
    globalThis.fetch = (async () =>
      new Response("Server error", { status: 500 })) as typeof fetch;

    const result = await fetchSnippet("src/Page.astro:1:1");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    const result = await fetchSnippet("src/Page.astro:1:1");
    expect(result).toBeNull();
  });

  it("encodes the source attribute in the URL", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await fetchSnippet("src/Page.astro:7:5");

    expect(capturedUrl).toContain("/__astro-grab/snippet");
    expect(capturedUrl).toContain("src=" + encodeURIComponent("src/Page.astro:7:5"));
  });

  it("passes contextLines parameter", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await fetchSnippet("src/Page.astro:7:5", 10);

    expect(capturedUrl).toContain("contextLines=10");
  });

  it("uses default contextLines of 5", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await fetchSnippet("src/Page.astro:7:5");

    expect(capturedUrl).toContain("contextLines=5");
  });
});
