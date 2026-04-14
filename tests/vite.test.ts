import { describe, it, expect } from "bun:test";
import { transformCode, extractAstroTemplate, transformAstroFile } from "../src/vite.js";

describe("transformCode (JSX/TSX)", () => {
  it("injects data-astro-source on HTML elements", () => {
    const code = `<div>Hello</div>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    expect(result).toContain('data-astro-source="src/App.tsx:1:1"');
  });

  it("injects data-astro-component on PascalCase elements", () => {
    const code = `<MyComponent />`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    expect(result).toContain('data-astro-component="MyComponent"');
    expect(result).toContain('data-astro-source="src/App.tsx:1:1"');
  });

  it("does not inject component attr on lowercase elements", () => {
    const code = `<button>Click</button>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    expect(result).toContain("data-astro-source");
    expect(result).not.toContain("data-astro-component");
  });

  it("handles multiline JSX", () => {
    const code = `function App() {
  return (
    <div>
      <h1>Title</h1>
      <Button />
    </div>
  );
}`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    expect(result).toContain('data-astro-source="src/App.tsx:3:5"');
    expect(result).toContain('data-astro-source="src/App.tsx:4:7"');
    expect(result).toContain('data-astro-component="Button"');
  });

  it("skips TypeScript generics (preceded by identifier)", () => {
    const code = `const x = Array<string>();`;
    const result = transformCode(code, "src/test.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    // Should not inject into generic syntax
    expect(result).not.toContain("data-astro-source");
  });

  it("handles comparison operators", () => {
    const code = `if (x < 5) { y = 10; }`;
    const result = transformCode(code, "src/test.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    // x < 5 should not be treated as JSX
    expect(result).toBe(code);
  });

  it("respects jsxLocation=false option", () => {
    const code = `<div>Hello</div>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: false,
      componentLocation: true,
    });

    expect(result).not.toContain("data-astro-source");
  });

  it("respects componentLocation=false option", () => {
    const code = `<MyComponent />`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
    expect(result).not.toContain("data-astro-component");
  });

  it("handles dotted component names", () => {
    const code = `<Foo.Bar />`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    expect(result).toContain('data-astro-component="Foo.Bar"');
  });

  it("strips leading slash from file path", () => {
    const code = `<div />`;
    const result = transformCode(code, "/src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain('data-astro-source="src/App.tsx:');
  });
});

describe("extractAstroTemplate", () => {
  it("extracts template after frontmatter", () => {
    const code = `---
const title = "Hello";
---
<div>{title}</div>`;

    const result = extractAstroTemplate(code);
    expect(result).not.toBeNull();
    expect(result!.template).toContain("<div>");
    expect(result!.template).not.toContain("const title");
  });

  it("handles files without frontmatter", () => {
    const code = `<div>No frontmatter</div>`;
    const result = extractAstroTemplate(code);
    expect(result).not.toBeNull();
    expect(result!.templateStart).toBe(0);
    expect(result!.template).toBe(code);
  });

  it("handles empty frontmatter", () => {
    const code = `---
---
<div>Hello</div>`;

    const result = extractAstroTemplate(code);
    expect(result).not.toBeNull();
    expect(result!.template.trim()).toBe("<div>Hello</div>");
  });
});

describe("transformAstroFile", () => {
  it("only transforms the template section", () => {
    const code = `---
const items = ["a", "b"];
const x = 5;
---
<div>
  <h1>Title</h1>
</div>`;

    const result = transformAstroFile(code, "src/Page.astro", {
      jsxLocation: true,
      componentLocation: true,
    });

    // Frontmatter should be unchanged
    expect(result).toContain('const items = ["a", "b"]');
    expect(result).toContain("const x = 5");

    // Template should have attributes
    expect(result).toContain("data-astro-source");
  });

  it("computes correct line numbers in template section", () => {
    const code = `---
const a = 1;
const b = 2;
---
<main>
  <p>Hello</p>
</main>`;

    const result = transformAstroFile(code, "src/Page.astro", {
      jsxLocation: true,
      componentLocation: false,
    });

    // <main> is on line 5, <p> is on line 6
    expect(result).toContain('data-astro-source="src/Page.astro:5:');
    expect(result).toContain('data-astro-source="src/Page.astro:6:');
  });

  it("injects component attributes for PascalCase tags in templates", () => {
    const code = `---
import Card from "./Card.astro";
---
<Card>
  <p>Content</p>
</Card>`;

    const result = transformAstroFile(code, "src/Page.astro", {
      jsxLocation: true,
      componentLocation: true,
    });

    expect(result).toContain('data-astro-component="Card"');
  });

  it("handles files without frontmatter", () => {
    const code = `<div>Simple</div>`;
    const result = transformAstroFile(code, "src/Simple.astro", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
  });
});
