/**
 * astro-grab/vite
 *
 * A Vite plugin that injects source-location data attributes into Astro
 * templates and framework component JSX so the runtime overlay can map
 * DOM elements back to source code.
 *
 * Handles both:
 *   - .astro files (template section after frontmatter ---)
 *   - .jsx/.tsx files (framework island components)
 *
 * When used as an Astro integration, this is injected automatically.
 * For standalone Vite use:
 *
 *   import astroGrab from "astro-grab/vite";
 *   export default defineConfig({
 *     plugins: [astroGrab(), ...],
 *   });
 */

import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import type { AstroGrabViteOptions } from "./types.js";

const VIRTUAL_INIT = "virtual:astro-grab-init";
const RESOLVED_VIRTUAL_INIT = "\0" + VIRTUAL_INIT;

// ── Regex-based JSX transform ────────────────────────────────────────

/**
 * Candidate regex for JSX/HTML opening tags. The negative lookbehind (?<!\w)
 * filters TypeScript generics (where `<` directly follows an identifier).
 */
const JSX_OPEN_TAG_RE =
  /(?<!\w)(<\s*)([A-Z_a-z][\w.:-]*)(\s|\/?>)/g;

/** Matches component-style names: PascalCase or contains a dot (Foo.Bar). */
const COMPONENT_NAME_RE = /^[A-Z]|[.]/;

/** Keywords that can directly precede a JSX expression. */
const JSX_PRECEDING_KEYWORDS = new Set([
  "return", "yield", "case", "default", "else",
]);

/**
 * Walks backwards from `<` to determine if it's a JSX tag or comparison.
 */
function isLikelyJsx(code: string, ltIndex: number): boolean {
  let i = ltIndex - 1;
  while (i >= 0 && (code[i] === " " || code[i] === "\t" || code[i] === "\n" || code[i] === "\r")) {
    i--;
  }

  if (i < 0) return true;

  const ch = code[i]!;

  if (ch === ")" || ch === "]" || ch === '"' || ch === "'" || ch === "`") {
    return false;
  }

  if ("({[,;:?=!>&|+-*/%^~".includes(ch)) {
    return true;
  }

  if (/\w/.test(ch)) {
    const end = i + 1;
    while (i >= 0 && /\w/.test(code[i]!)) i--;
    const word = code.slice(i + 1, end);
    return JSX_PRECEDING_KEYWORDS.has(word);
  }

  return true;
}

function computeLineStarts(code: string): number[] {
  const lineStarts: number[] = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "\n") lineStarts.push(i + 1);
  }
  return lineStarts;
}

function getLineCol(lineStarts: number[], offset: number): [number, number] {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return [lo + 1, offset - lineStarts[lo]! + 1];
}

/**
 * Transform JSX/HTML code by injecting data attributes on opening tags.
 */
export function transformCode(
  code: string,
  fileId: string,
  opts: { jsxLocation: boolean; componentLocation: boolean }
): string {
  const lineStarts = computeLineStarts(code);
  const shortFile = fileId.replace(/^\//, "");

  let result = "";
  let lastIndex = 0;

  JSX_OPEN_TAG_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = JSX_OPEN_TAG_RE.exec(code)) !== null) {
    const fullMatch = match[0]!;
    const prefix = match[1]!;
    const tagName = match[2]!;
    const suffix = match[3]!;
    const offset = match.index;

    // In JSX/TSX files, skip comparisons
    if (!isLikelyJsx(code, offset)) {
      continue;
    }

    const [line, col] = getLineCol(lineStarts, offset);
    const isComponent = COMPONENT_NAME_RE.test(tagName);

    const attrs: string[] = [];

    if (opts.jsxLocation) {
      attrs.push(`data-astro-source="${shortFile}:${line}:${col}"`);
    }

    if (opts.componentLocation && isComponent) {
      attrs.push(`data-astro-component="${tagName}"`);
    }

    if (attrs.length === 0) {
      result += code.slice(lastIndex, match.index + fullMatch.length);
      lastIndex = match.index + fullMatch.length;
      continue;
    }

    const attrStr = " " + attrs.join(" ");

    result += code.slice(lastIndex, match.index);
    result += prefix + tagName + attrStr + suffix;
    lastIndex = match.index + fullMatch.length;
  }

  result += code.slice(lastIndex);
  return result;
}

/**
 * Extract the template section from an .astro file (after the frontmatter).
 * Returns { templateStart, template } or null if no frontmatter found.
 */
export function extractAstroTemplate(code: string): { templateStart: number; template: string } | null {
  // Astro frontmatter is delimited by --- at the start
  const firstFence = code.indexOf("---");
  if (firstFence === -1) {
    // No frontmatter — entire file is template
    return { templateStart: 0, template: code };
  }

  const secondFence = code.indexOf("---", firstFence + 3);
  if (secondFence === -1) {
    // Malformed — single --- with no closing. Treat rest as template.
    return { templateStart: firstFence + 3, template: code.slice(firstFence + 3) };
  }

  // Template starts after the closing ---
  const templateStart = secondFence + 3;
  return { templateStart, template: code.slice(templateStart) };
}

/**
 * Transform an .astro file. Only the template section (after frontmatter) is modified.
 */
export function transformAstroFile(
  code: string,
  fileId: string,
  opts: { jsxLocation: boolean; componentLocation: boolean }
): string {
  const extracted = extractAstroTemplate(code);
  if (!extracted) return code;

  const { templateStart, template } = extracted;

  // Compute a line offset so source locations are correct
  const linesBeforeTemplate = code.slice(0, templateStart).split("\n").length - 1;

  // We need line starts for the full file for correct positions
  const lineStarts = computeLineStarts(code);
  const shortFile = fileId.replace(/^\//, "");

  let result = "";
  let lastIndex = 0;

  JSX_OPEN_TAG_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = JSX_OPEN_TAG_RE.exec(template)) !== null) {
    const fullMatch = match[0]!;
    const prefix = match[1]!;
    const tagName = match[2]!;
    const suffix = match[3]!;

    // Compute absolute offset in the full file
    const absoluteOffset = templateStart + match.index;
    const [line, col] = getLineCol(lineStarts, absoluteOffset);

    const isComponent = COMPONENT_NAME_RE.test(tagName);

    const attrs: string[] = [];

    if (opts.jsxLocation) {
      attrs.push(`data-astro-source="${shortFile}:${line}:${col}"`);
    }

    if (opts.componentLocation && isComponent) {
      attrs.push(`data-astro-component="${tagName}"`);
    }

    if (attrs.length === 0) {
      result += template.slice(lastIndex, match.index + fullMatch.length);
      lastIndex = match.index + fullMatch.length;
      continue;
    }

    const attrStr = " " + attrs.join(" ");

    result += template.slice(lastIndex, match.index);
    result += prefix + tagName + attrStr + suffix;
    lastIndex = match.index + fullMatch.length;
  }

  result += template.slice(lastIndex);

  // Reassemble: frontmatter + transformed template
  return code.slice(0, templateStart) + result;
}

// ── The Vite plugin ──────────────────────────────────────────────────

export default function astroGrabVite(
  options: AstroGrabViteOptions = {}
): Plugin {
  const {
    jsxLocation = true,
    componentLocation = true,
    autoImport = true,
    key = "Alt",
  } = options;

  let projectRoot = "";

  return {
    name: "astro-grab",
    enforce: "pre",
    apply: "serve", // Dev mode only

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
    },

    resolveId(id) {
      if (id === VIRTUAL_INIT) return RESOLVED_VIRTUAL_INIT;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_INIT) {
        return `import { initAstroGrab } from "astro-grab";\ninitAstroGrab({ key: "${key}" });`;
      }
    },

    transform(code, id) {
      if (id.includes("node_modules")) return null;

      const relativePath = id.startsWith(projectRoot)
        ? id.slice(projectRoot.length + 1)
        : id;

      // Handle .astro files
      if (id.endsWith(".astro")) {
        const transformed = transformAstroFile(code, relativePath, {
          jsxLocation,
          componentLocation,
        });
        if (transformed === code) return null;
        return { code: transformed, map: null };
      }

      // Handle JSX/TSX framework island files
      if (/\.[jt]sx$/.test(id)) {
        const transformed = transformCode(code, relativePath, {
          jsxLocation,
          componentLocation,
        });
        if (transformed === code) return null;
        return { code: transformed, map: null };
      }

      return null;
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: { url?: string }, _res: unknown, next: () => void) => {
        if (req.url === "/@astro-grab/init") {
          req.url = `/@id/${VIRTUAL_INIT}`;
        }
        next();
      });
    },

    transformIndexHtml() {
      if (!autoImport) return;
      return [
        {
          tag: "script",
          attrs: { type: "module", src: "/@astro-grab/init" },
          injectTo: "head" as const,
        },
      ];
    },
  };
}
