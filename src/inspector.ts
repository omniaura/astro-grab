/**
 * inspector.ts
 *
 * Core logic for mapping a DOM element back to:
 *   1. Its source location (via data-astro-source)
 *   2. Its component ancestry chain (via data-astro-component)
 *   3. A formatted context string suitable for AI agent prompts
 */

import {
  ATTR_SOURCE,
  ATTR_COMPONENT,
  type SourceLocation,
  type ComponentInfo,
  type GrabbedContext,
  type SnippetResponse,
} from "./types.js";

// ── Source location parsing ──────────────────────────────────────────

/**
 * Parse a `data-astro-source` attribute value.
 * Format: "path/to/file.astro:42:8"
 */
export function parseSourceAttr(value: string | null): SourceLocation | null {
  if (!value) return null;

  // Match "file:line:col" — file can contain colons on Windows (C:\...)
  // So we split from the right
  const parts = value.split(":");
  if (parts.length < 3) return null;

  const col = parseInt(parts.pop()!, 10);
  const line = parseInt(parts.pop()!, 10);
  const file = parts.join(":");

  if (isNaN(line) || isNaN(col)) return null;

  return { file, line, column: col };
}

// ── DOM walking ──────────────────────────────────────────────────────

/**
 * Find the nearest source location by walking up from a DOM element.
 */
export function findNearestSource(el: HTMLElement): SourceLocation | null {
  let current: HTMLElement | null = el;
  while (current) {
    const attr = current.getAttribute(ATTR_SOURCE);
    if (attr) return parseSourceAttr(attr);
    current = current.parentElement;
  }
  return null;
}

/**
 * Find the source location directly on this element (not walking up).
 */
export function getElementSource(el: HTMLElement): SourceLocation | null {
  return parseSourceAttr(el.getAttribute(ATTR_SOURCE));
}

/**
 * Find the nearest component name by walking up from a DOM element.
 */
export function findNearestComponent(el: HTMLElement): string | null {
  let current: HTMLElement | null = el;
  while (current) {
    const name = current.getAttribute(ATTR_COMPONENT);
    if (name) return name;
    current = current.parentElement;
  }
  return null;
}

/**
 * Collect the full component ancestry chain by walking up from an element.
 * Returns innermost component first.
 */
export function getComponentChain(el: HTMLElement): ComponentInfo[] {
  const chain: ComponentInfo[] = [];
  const seen = new Set<string>();
  let current: HTMLElement | null = el;

  while (current) {
    const name = current.getAttribute(ATTR_COMPONENT);
    if (name) {
      const source = getElementSource(current);
      // Deduplicate consecutive identical component names
      const key = `${name}:${source?.file}:${source?.line}`;
      if (!seen.has(key)) {
        seen.add(key);
        chain.push({ name, location: source });
      }
    }
    current = current.parentElement;
  }

  return chain;
}

// ── Server snippet fetching ──────────────────────────────────────────

/**
 * Fetch a source code snippet from the dev server's snippet endpoint.
 *
 * @param sourceAttr - The data-astro-source attribute value (e.g. "src/Page.astro:5:3")
 * @param contextLines - Number of lines above/below the target line to include
 * @returns The snippet response, or null if the fetch fails
 */
export async function fetchSnippet(
  sourceAttr: string,
  contextLines = 5,
): Promise<SnippetResponse | null> {
  try {
    const url = `/__astro-grab/snippet?src=${encodeURIComponent(sourceAttr)}&contextLines=${contextLines}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as SnippetResponse;
  } catch {
    return null;
  }
}

// ── Context formatting ───────────────────────────────────────────────

/**
 * Get the trimmed outer HTML of an element, truncated to a max length.
 */
function getElementSnippet(el: HTMLElement, maxLen = 200): string {
  const html = el.outerHTML;
  if (html.length <= maxLen) return html;
  return html.slice(0, maxLen) + "...";
}

function formatSource(source: SourceLocation | null): string {
  if (!source) return "";
  return `${source.file}:${source.line}:${source.column}`;
}

function formatComponentTree(components: ComponentInfo[]): string {
  return components
    .map((comp) => {
      const loc = comp.location ? ` -> ${formatSource(comp.location)}` : "";
      return `<${comp.name} />${loc}`;
    })
    .join("\n");
}

function getTemplateVariables(ctx: Omit<GrabbedContext, "formatted">): Record<string, string> {
  return {
    tagName: ctx.tagName,
    source: formatSource(ctx.elementSource),
    components: formatComponentTree(ctx.components),
    html: getElementSnippet(ctx.element, 500),
    file: ctx.elementSource?.file ?? ctx.snippet?.file ?? "",
    line: ctx.elementSource ? String(ctx.elementSource.line) : "",
    snippet: ctx.snippet?.snippet ?? "",
    startLine: ctx.snippet ? String(ctx.snippet.startLine) : "",
    endLine: ctx.snippet ? String(ctx.snippet.endLine) : "",
    targetLine: ctx.snippet ? String(ctx.snippet.targetLine) : "",
    language: ctx.snippet?.language ?? "",
  };
}

export function interpolateTemplate(
  template: string,
  ctx: Omit<GrabbedContext, "formatted">
): string {
  const variables = getTemplateVariables(ctx);
  return template.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_match, key: string) => {
    return variables[key] ?? "";
  });
}

/**
 * Get key attributes of an element as a summary.
 */
function getElementSummary(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const parts: string[] = [`<${tag}`];

  const id = el.id;
  if (id) parts.push(`id="${id}"`);

  const cls = el.className;
  if (cls && typeof cls === "string") {
    const trimmed = cls.trim();
    if (trimmed.length <= 80) {
      parts.push(`class="${trimmed}"`);
    } else {
      parts.push(`class="${trimmed.slice(0, 77)}..."`);
    }
  }

  // Include data-testid if present
  const testId = el.getAttribute("data-testid");
  if (testId) parts.push(`data-testid="${testId}"`);

  return parts.join(" ") + ">";
}

/**
 * Format the full grabbed context into a string for AI agent prompts.
 */
export function formatContext(
  ctx: Omit<GrabbedContext, "formatted">,
  template?: string
): string {
  if (template) {
    return interpolateTemplate(template, ctx);
  }

  const lines: string[] = [];

  lines.push("--- astro-grab context ---");
  lines.push("");

  // Element info
  lines.push(`Element: ${getElementSummary(ctx.element)}`);

  if (ctx.elementSource) {
    const s = ctx.elementSource;
    lines.push(`Source:  ${s.file}:${s.line}:${s.column}`);
  }

  // Component chain
  if (ctx.components.length > 0) {
    lines.push("");
    lines.push("Component tree (innermost \u2192 outermost):");
    for (const comp of ctx.components) {
      const loc = comp.location
        ? ` \u2192 ${comp.location.file}:${comp.location.line}:${comp.location.column}`
        : "";
      lines.push(`  <${comp.name} />${loc}`);
    }
  }

  // Source snippet (if available) or HTML fallback
  if (ctx.snippet) {
    lines.push("");
    lines.push(`Source (${ctx.snippet.language}, lines ${ctx.snippet.startLine}-${ctx.snippet.endLine}):`);
    lines.push("```" + ctx.snippet.language);
    lines.push(ctx.snippet.snippet);
    lines.push("```");
  } else {
    lines.push("");
    lines.push("HTML:");
    lines.push(getElementSnippet(ctx.element, 500));
  }

  lines.push("");
  lines.push("--- end astro-grab context ---");

  return lines.join("\n");
}

// ── Full inspection ──────────────────────────────────────────────────

/**
 * Inspect a DOM element and produce the full GrabbedContext.
 */
export function inspect(el: HTMLElement, template?: string): GrabbedContext {
  const elementSource = getElementSource(el) ?? findNearestSource(el);
  const components = getComponentChain(el);

  const partial = {
    element: el,
    tagName: el.tagName.toLowerCase(),
    elementSource,
    components,
    timestamp: Date.now(),
  };

  return {
    ...partial,
    formatted: formatContext(partial, template),
  };
}
