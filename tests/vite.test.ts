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

  // ── New: self-closing tags ────────────────────────────────────────────

  it("handles self-closing HTML tags", () => {
    const code = `<input />`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain('data-astro-source="src/App.tsx:1:1"');
  });

  it("handles self-closing tags without space before />", () => {
    const code = `<br/>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
  });

  // ── New: deeply nested JSX ────────────────────────────────────────────

  it("handles deeply nested JSX structures (5+ levels)", () => {
    const code = `return (
  <div>
    <section>
      <article>
        <div>
          <p>
            <span>Deep</span>
          </p>
        </div>
      </article>
    </section>
  </div>
)`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    // Each opening tag should get instrumented
    expect(result).toContain('data-astro-source="src/App.tsx:2:3"'); // div
    expect(result).toContain('data-astro-source="src/App.tsx:3:5"'); // section
    expect(result).toContain('data-astro-source="src/App.tsx:4:7"'); // article
    expect(result).toContain('data-astro-source="src/App.tsx:5:9"'); // inner div
    expect(result).toContain('data-astro-source="src/App.tsx:6:11"'); // p
    expect(result).toContain('data-astro-source="src/App.tsx:7:13"'); // span
  });

  // ── New: template literals with < characters ──────────────────────────

  it("does not transform < in template literals used as comparisons", () => {
    const code = 'const msg = `${count < 5 ? "few" : "many"}`;';
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    // The < in the template literal should not be treated as JSX
    // (5 is a numeric literal, not a tag name matching [A-Z_a-z])
    expect(result).toBe(code);
  });

  // ── New: both options disabled ────────────────────────────────────────

  it("returns input unchanged when both jsxLocation and componentLocation are false", () => {
    const code = `<div><MyComponent /></div>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: false,
      componentLocation: false,
    });

    expect(result).toBe(code);
  });

  // ── New: multiple components ──────────────────────────────────────────

  it("instruments multiple component tags", () => {
    const code = `<Header />\n<Main />\n<Footer />`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    expect(result).toContain('data-astro-component="Header"');
    expect(result).toContain('data-astro-component="Main"');
    expect(result).toContain('data-astro-component="Footer"');
  });

  // ── New: tags with existing attributes ────────────────────────────────

  it("instruments tags that already have attributes", () => {
    const code = `<div class="wrapper">Hello</div>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    // The regex captures the opening `<div ` and injects before class
    // Let's just verify the source attr is present
    expect(result).toContain("data-astro-source");
  });

  // ── New: JSX after keywords ───────────────────────────────────────────

  it("recognizes JSX after return keyword", () => {
    const code = `return <div>hello</div>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
  });

  it("recognizes JSX after yield keyword", () => {
    const code = `yield <div>hello</div>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
  });

  it("recognizes JSX after assignment operator", () => {
    const code = `const el = <div>hello</div>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
  });

  it("recognizes JSX after opening paren", () => {
    const code = `render(<div>hello</div>)`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
  });

  // ── New: empty JSX element ────────────────────────────────────────────

  it("handles an empty element with no children", () => {
    const code = `<div></div>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
  });

  // ── New: hyphenated tag names (web components) ────────────────────────

  it("handles hyphenated custom element tag names", () => {
    const code = `<my-element>content</my-element>`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
  });

  it("does not treat hyphenated elements as components", () => {
    const code = `<my-element />`;
    const result = transformCode(code, "src/App.tsx", {
      jsxLocation: true,
      componentLocation: true,
    });

    // Hyphenated names start with lowercase, so no component attr
    expect(result).not.toContain("data-astro-component");
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

  // ── New: edge cases ────────────────────────────────────────────────────

  it("handles a file with only frontmatter (no template)", () => {
    const code = `---
const x = 1;
---`;

    const result = extractAstroTemplate(code);
    expect(result).not.toBeNull();
    // Template should be empty (just what's after the closing ---)
    expect(result!.template).toBe("");
  });

  it("handles a file with a single unclosed --- (malformed frontmatter)", () => {
    const code = `---
const x = 1;
<div>Content after unclosed fence</div>`;

    const result = extractAstroTemplate(code);
    expect(result).not.toBeNull();
    // Since only one --- was found, the rest after it becomes the template
    expect(result!.template).toContain("const x = 1;");
    expect(result!.template).toContain("<div>Content after unclosed fence</div>");
  });

  it("handles empty file", () => {
    const code = "";
    const result = extractAstroTemplate(code);
    expect(result).not.toBeNull();
    expect(result!.templateStart).toBe(0);
    expect(result!.template).toBe("");
  });

  it("handles file with just whitespace", () => {
    const code = "   \n\n   ";
    const result = extractAstroTemplate(code);
    expect(result).not.toBeNull();
    // No --- found, so entire content is the template
    expect(result!.templateStart).toBe(0);
    expect(result!.template).toBe(code);
  });

  it("handles frontmatter with complex expressions", () => {
    const code = `---
const items = [1, 2, 3];
const filtered = items.filter(i => i > 1);
---
<ul>{filtered.map(i => <li>{i}</li>)}</ul>`;

    const result = extractAstroTemplate(code);
    expect(result).not.toBeNull();
    expect(result!.template).toContain("<ul>");
    expect(result!.template).not.toContain("const items");
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

  // ── New: empty .astro files ───────────────────────────────────────────

  it("handles a file with only frontmatter and no template content", () => {
    const code = `---
const x = 1;
---`;

    const result = transformAstroFile(code, "src/Empty.astro", {
      jsxLocation: true,
      componentLocation: true,
    });

    // Frontmatter preserved, nothing to transform in the empty template
    expect(result).toContain("const x = 1;");
    expect(result).not.toContain("data-astro-source");
  });

  it("handles an empty file", () => {
    const code = "";
    const result = transformAstroFile(code, "src/Empty.astro", {
      jsxLocation: true,
      componentLocation: true,
    });

    expect(result).toBe("");
  });

  // ── New: deeply nested structures in .astro templates ─────────────────

  it("handles deeply nested structures in .astro templates", () => {
    const code = `---
---
<div>
  <section>
    <article>
      <div>
        <p>
          <span>Deep</span>
        </p>
      </div>
    </article>
  </section>
</div>`;

    const result = transformAstroFile(code, "src/Deep.astro", {
      jsxLocation: true,
      componentLocation: false,
    });

    // Each opening tag in the template should get a source attribute
    // The template starts at line 3 (after ---)
    expect(result).toContain('data-astro-source="src/Deep.astro:3:');
    expect(result).toContain('data-astro-source="src/Deep.astro:4:');
    expect(result).toContain('data-astro-source="src/Deep.astro:5:');
    expect(result).toContain('data-astro-source="src/Deep.astro:6:');
    expect(result).toContain('data-astro-source="src/Deep.astro:7:');
    expect(result).toContain('data-astro-source="src/Deep.astro:8:');
  });

  // ── New: self-closing tags in .astro ──────────────────────────────────

  it("handles self-closing tags in .astro templates", () => {
    const code = `---
---
<img />
<br/>
<input />`;

    const result = transformAstroFile(code, "src/Tags.astro", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain('data-astro-source="src/Tags.astro:3:');
    expect(result).toContain('data-astro-source="src/Tags.astro:4:');
    expect(result).toContain('data-astro-source="src/Tags.astro:5:');
  });

  // ── New: both options disabled ────────────────────────────────────────

  it("returns unchanged code when both options are disabled", () => {
    const code = `---
---
<div><MyComponent /></div>`;

    const result = transformAstroFile(code, "src/Page.astro", {
      jsxLocation: false,
      componentLocation: false,
    });

    expect(result).toBe(code);
  });

  // ── New: preserves frontmatter exactly ────────────────────────────────

  it("preserves frontmatter imports and expressions exactly", () => {
    const code = `---
import Layout from "../layouts/Layout.astro";
import Card from "../components/Card.astro";
const title = "My Page";
const items = [1, 2, 3];
---
<Layout title={title}>
  <Card />
</Layout>`;

    const result = transformAstroFile(code, "src/Page.astro", {
      jsxLocation: true,
      componentLocation: true,
    });

    // Frontmatter is byte-for-byte identical
    expect(result).toContain('import Layout from "../layouts/Layout.astro";');
    expect(result).toContain('import Card from "../components/Card.astro";');
    expect(result).toContain('const title = "My Page";');
    expect(result).toContain("const items = [1, 2, 3];");

    // Template is instrumented
    expect(result).toContain('data-astro-component="Layout"');
    expect(result).toContain('data-astro-component="Card"');
  });

  // ── New: multiple components in template ──────────────────────────────

  it("instruments all component tags in a template", () => {
    const code = `---
---
<Header />
<Main />
<Footer />`;

    const result = transformAstroFile(code, "src/Page.astro", {
      jsxLocation: true,
      componentLocation: true,
    });

    expect(result).toContain('data-astro-component="Header"');
    expect(result).toContain('data-astro-component="Main"');
    expect(result).toContain('data-astro-component="Footer"');
  });

  // ── New: template with HTML entities and special content ──────────────

  it("handles template with script content", () => {
    const code = `---
---
<div>
  <p>Content</p>
</div>
<style>
  .wrapper { color: red; }
</style>`;

    const result = transformAstroFile(code, "src/Styled.astro", {
      jsxLocation: true,
      componentLocation: false,
    });

    // The <style> tag should also get instrumented (it's an opening HTML tag)
    expect(result).toContain("data-astro-source");
    // The style content should be preserved
    expect(result).toContain("color: red;");
  });

  // ── New: inline expressions in template ───────────────────────────────

  it("handles inline expressions in curly braces", () => {
    const code = `---
const name = "World";
---
<h1>Hello {name}!</h1>`;

    const result = transformAstroFile(code, "src/Page.astro", {
      jsxLocation: true,
      componentLocation: false,
    });

    expect(result).toContain("data-astro-source");
    expect(result).toContain("{name}");
  });
});
