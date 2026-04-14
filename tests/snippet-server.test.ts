import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectLanguage,
  parseSourceLocation,
  extractSnippet,
  createSnippetMiddleware,
} from "../src/snippet-server.js";

// ── detectLanguage ────────────────────────────────────────────────────

describe("detectLanguage", () => {
  it("detects .astro files", () => {
    expect(detectLanguage("src/Page.astro")).toBe("astro");
  });

  it("detects .tsx files", () => {
    expect(detectLanguage("components/App.tsx")).toBe("tsx");
  });

  it("detects .jsx files", () => {
    expect(detectLanguage("components/App.jsx")).toBe("jsx");
  });

  it("detects .ts files", () => {
    expect(detectLanguage("utils/helpers.ts")).toBe("typescript");
  });

  it("detects .js files", () => {
    expect(detectLanguage("utils/helpers.js")).toBe("javascript");
  });

  it("detects .svelte files", () => {
    expect(detectLanguage("components/Card.svelte")).toBe("svelte");
  });

  it("detects .vue files", () => {
    expect(detectLanguage("components/Card.vue")).toBe("vue");
  });

  it("returns plaintext for unknown extensions", () => {
    expect(detectLanguage("README.md")).toBe("plaintext");
  });

  it("returns plaintext for files without extensions", () => {
    expect(detectLanguage("Makefile")).toBe("plaintext");
  });

  it("handles uppercase extensions by lowercasing", () => {
    expect(detectLanguage("Page.ASTRO")).toBe("astro");
  });
});

// ── parseSourceLocation ───────────────────────────────────────────────

describe("parseSourceLocation", () => {
  it("parses a standard file:line:col string", () => {
    const loc = parseSourceLocation("src/Page.astro:42:8");
    expect(loc.file).toBe("src/Page.astro");
    expect(loc.line).toBe(42);
    expect(loc.column).toBe(8);
  });

  it("handles deeply nested paths", () => {
    const loc = parseSourceLocation("src/components/ui/Card.tsx:10:3");
    expect(loc.file).toBe("src/components/ui/Card.tsx");
    expect(loc.line).toBe(10);
    expect(loc.column).toBe(3);
  });

  it("throws for missing column", () => {
    expect(() => parseSourceLocation("src/Page.astro:42")).toThrow("Invalid source location format");
  });

  it("throws for empty string", () => {
    expect(() => parseSourceLocation("")).toThrow("Invalid source location format");
  });

  it("throws for non-numeric line", () => {
    expect(() => parseSourceLocation("src/Page.astro:abc:8")).toThrow("Invalid source location values");
  });

  it("throws for non-numeric column", () => {
    expect(() => parseSourceLocation("src/Page.astro:42:xyz")).toThrow("Invalid source location values");
  });

  it("throws for zero line number", () => {
    expect(() => parseSourceLocation("src/Page.astro:0:1")).toThrow("Invalid source location values");
  });

  it("throws for negative line number", () => {
    expect(() => parseSourceLocation("src/Page.astro:-1:1")).toThrow("Invalid source location values");
  });

  it("handles files with colons in the path", () => {
    // Simulates something like a Windows-style path segment
    const loc = parseSourceLocation("C:src/Page.astro:10:5");
    expect(loc.file).toBe("C:src/Page.astro");
    expect(loc.line).toBe(10);
    expect(loc.column).toBe(5);
  });
});

// ── extractSnippet ────────────────────────────────────────────────────

describe("extractSnippet", () => {
  const sampleContent = [
    "line 1",
    "line 2",
    "line 3",
    "line 4",
    "line 5",
    "line 6",
    "line 7",
    "line 8",
    "line 9",
    "line 10",
  ].join("\n");

  it("extracts lines around the target line", () => {
    const result = extractSnippet(sampleContent, 5, 2);
    expect(result.startLine).toBe(3);
    expect(result.endLine).toBe(7);
    expect(result.snippet).toBe("line 3\nline 4\nline 5\nline 6\nline 7");
  });

  it("clamps at the start of the file", () => {
    const result = extractSnippet(sampleContent, 1, 3);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(4);
    expect(result.snippet).toBe("line 1\nline 2\nline 3\nline 4");
  });

  it("clamps at the end of the file", () => {
    const result = extractSnippet(sampleContent, 10, 3);
    expect(result.startLine).toBe(7);
    expect(result.endLine).toBe(10);
    expect(result.snippet).toBe("line 7\nline 8\nline 9\nline 10");
  });

  it("handles contextLines=0 (only the target line)", () => {
    const result = extractSnippet(sampleContent, 5, 0);
    expect(result.startLine).toBe(5);
    expect(result.endLine).toBe(5);
    expect(result.snippet).toBe("line 5");
  });

  it("handles contextLines larger than file", () => {
    const result = extractSnippet(sampleContent, 5, 100);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(10);
    expect(result.snippet).toBe(sampleContent);
  });

  it("clamps target line beyond file end", () => {
    const result = extractSnippet(sampleContent, 999, 2);
    expect(result.startLine).toBe(8);
    expect(result.endLine).toBe(10);
  });

  it("clamps target line below 1", () => {
    const result = extractSnippet(sampleContent, -5, 2);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(3);
  });

  it("handles a single-line file", () => {
    const result = extractSnippet("only line", 1, 5);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(1);
    expect(result.snippet).toBe("only line");
  });

  it("handles empty file content", () => {
    const result = extractSnippet("", 1, 5);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(1);
    expect(result.snippet).toBe("");
  });
});

// ── createSnippetMiddleware (integration) ─────────────────────────────

describe("createSnippetMiddleware", () => {
  let tempDir: string;
  let middleware: ReturnType<typeof createSnippetMiddleware>;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "astro-grab-test-"));

    // Create test source files
    await writeFile(
      join(tempDir, "src", "Page.astro").replace("src/Page.astro", ""),
      "",
      { recursive: true } as never,
    ).catch(() => {});

    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(tempDir, "src", "components"), { recursive: true });

    await writeFile(
      join(tempDir, "src", "Page.astro"),
      [
        "---",
        'import Card from "./components/Card.astro";',
        "---",
        "<html>",
        "  <head><title>Test</title></head>",
        "  <body>",
        "    <h1>Hello World</h1>",
        "    <Card />",
        "  </body>",
        "</html>",
      ].join("\n"),
    );

    await writeFile(
      join(tempDir, "src", "components", "Card.tsx"),
      [
        'import { type Component } from "solid-js";',
        "",
        "const Card: Component = () => {",
        "  return (",
        "    <div class=\"card\">",
        "      <h2>Card Title</h2>",
        "      <p>Card content</p>",
        "    </div>",
        "  );",
        "};",
        "",
        "export default Card;",
      ].join("\n"),
    );

    middleware = createSnippetMiddleware(tempDir);
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Helper to simulate a middleware request
  function makeRequest(url: string): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
    return new Promise((resolve) => {
      const headers: Record<string, string> = {};
      const req = { url, headers: { host: "localhost:4321" } };
      const res = {
        statusCode: 200,
        body: "",
        headers,
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
        end(body?: string) {
          res.body = body ?? "";
          resolve({ statusCode: res.statusCode, body: res.body, headers });
        },
      };
      middleware(req, res, () => {
        // next() was called — middleware didn't handle it
        resolve({ statusCode: -1, body: "next", headers });
      });
    });
  }

  it("passes through non-snippet requests", async () => {
    const result = await makeRequest("/some/other/path");
    expect(result.statusCode).toBe(-1);
    expect(result.body).toBe("next");
  });

  it("returns 400 for missing src parameter", async () => {
    const result = await makeRequest("/__astro-grab/snippet");
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Missing required query parameter: src");
  });

  it("returns 400 for invalid src format", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=bad-format");
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Invalid source location format");
  });

  it("returns 400 for invalid contextLines", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=src/Page.astro:5:3&contextLines=abc");
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Invalid contextLines parameter");
  });

  it("returns 400 for negative contextLines", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=src/Page.astro:5:3&contextLines=-5");
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Invalid contextLines parameter");
  });

  it("returns 404 for non-existent file", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=src/Missing.astro:1:1");
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("File not found");
  });

  it("returns a valid snippet for an existing .astro file", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=src/Page.astro:7:5");
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.file).toBe("src/Page.astro");
    expect(body.targetLine).toBe(7);
    expect(body.language).toBe("astro");
    expect(body.snippet).toContain("<h1>Hello World</h1>");
    expect(body.startLine).toBeLessThanOrEqual(7);
    expect(body.endLine).toBeGreaterThanOrEqual(7);
  });

  it("returns a valid snippet for a .tsx file", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=src/components/Card.tsx:5:5");
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.file).toBe("src/components/Card.tsx");
    expect(body.targetLine).toBe(5);
    expect(body.language).toBe("tsx");
    expect(body.snippet).toContain("card");
  });

  it("respects custom contextLines parameter", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=src/Page.astro:7:5&contextLines=1");
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    // With contextLines=1, we should get lines 6-8 (3 lines total)
    expect(body.startLine).toBe(6);
    expect(body.endLine).toBe(8);
  });

  it("uses default contextLines=5 when not specified", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=src/Page.astro:7:5");
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    // With contextLines=5, we should get lines 2-10 (but file only has 10 lines)
    expect(body.startLine).toBe(2);
    expect(body.endLine).toBe(10);
  });

  it("handles URL-encoded file paths with special characters", async () => {
    // The src parameter should be URL-decoded
    const encoded = encodeURIComponent("src/Page.astro:7:5");
    const result = await makeRequest(`/__astro-grab/snippet?src=${encoded}`);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.file).toBe("src/Page.astro");
  });

  it("returns JSON content type on success", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=src/Page.astro:1:1");
    expect(result.statusCode).toBe(200);
    expect(result.headers["Content-Type"]).toBe("application/json");
  });

  it("returns JSON content type on error", async () => {
    const result = await makeRequest("/__astro-grab/snippet");
    expect(result.statusCode).toBe(400);
    expect(result.headers["Content-Type"]).toBe("application/json");
  });

  it("blocks path traversal attempts", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=../../../etc/passwd:1:1");
    // Should be either 400 (path traversal blocked) or 404 (file not found)
    expect(result.statusCode === 400 || result.statusCode === 404).toBe(true);
  });

  it("handles contextLines=0", async () => {
    const result = await makeRequest("/__astro-grab/snippet?src=src/Page.astro:5:1&contextLines=0");
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.startLine).toBe(5);
    expect(body.endLine).toBe(5);
  });
});
