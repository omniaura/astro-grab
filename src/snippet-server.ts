/**
 * snippet-server.ts
 *
 * Server-side middleware that reads actual source files from disk and returns
 * a snippet of lines around a target location. Used by the client inspector
 * to enrich grabbed context with real source code instead of just outerHTML.
 *
 * Endpoint: GET /__astro-grab/snippet?src=FILE:LINE:COL&contextLines=N
 */

import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import type { SnippetResponse } from "./types.js";

// ── Language detection ────────────────────────────────────────────────

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".astro": "astro",
  ".tsx": "tsx",
  ".jsx": "jsx",
  ".ts": "typescript",
  ".js": "javascript",
  ".svelte": "svelte",
  ".vue": "vue",
};

/**
 * Detect the language identifier from a file extension.
 * Falls back to "plaintext" for unknown extensions.
 */
export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? "plaintext";
}

// ── Source location parsing ───────────────────────────────────────────

export interface ParsedSourceLocation {
  file: string;
  line: number;
  column: number;
}

/**
 * Parse a source location string in the format "file:line:col".
 * The file portion may contain colons (e.g. Windows paths like C:\foo),
 * so we split from the right.
 */
export function parseSourceLocation(src: string): ParsedSourceLocation {
  const parts = src.split(":");
  if (parts.length < 3) {
    throw new Error(`Invalid source location format: expected "file:line:col", got "${src}"`);
  }

  const colStr = parts.pop()!;
  const lineStr = parts.pop()!;
  const file = parts.join(":");

  const line = parseInt(lineStr, 10);
  const column = parseInt(colStr, 10);

  if (!file || isNaN(line) || isNaN(column) || line < 1 || column < 1) {
    throw new Error(`Invalid source location values: file="${file}", line=${lineStr}, col=${colStr}`);
  }

  return { file, line, column };
}

// ── Snippet extraction ────────────────────────────────────────────────

/**
 * Extract a window of lines around a target line from file content.
 * Clamps to file boundaries.
 */
export function extractSnippet(
  content: string,
  targetLine: number,
  contextLines: number,
): { snippet: string; startLine: number; endLine: number } {
  const lines = content.split("\n");
  const totalLines = lines.length;

  // Clamp target to valid range
  const clampedTarget = Math.max(1, Math.min(targetLine, totalLines));

  // Compute window (1-based)
  const startLine = Math.max(1, clampedTarget - contextLines);
  const endLine = Math.min(totalLines, clampedTarget + contextLines);

  const snippet = lines.slice(startLine - 1, endLine).join("\n");

  return { snippet, startLine, endLine };
}

// ── Middleware ─────────────────────────────────────────────────────────

interface ConnectRequest {
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ConnectResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

/**
 * Create a Vite/Connect middleware that serves source code snippets.
 *
 * @param projectRoot - The project root directory, used to resolve relative file paths
 */
export function createSnippetMiddleware(projectRoot: string) {
  return async (
    req: ConnectRequest,
    res: ConnectResponse,
    next: () => void,
  ) => {
    if (!req.url?.startsWith("/__astro-grab/snippet")) {
      return next();
    }

    try {
      const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
      const srcParam = url.searchParams.get("src");

      if (!srcParam) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing required query parameter: src" }));
        return;
      }

      // Parse context lines, default to 5
      const contextLinesParam = url.searchParams.get("contextLines");
      let contextLines = 5;
      if (contextLinesParam !== null) {
        const parsed = parseInt(contextLinesParam, 10);
        if (isNaN(parsed) || parsed < 0) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid contextLines parameter: must be a non-negative integer" }));
          return;
        }
        contextLines = parsed;
      }

      // Decode and parse the source location
      let loc: ParsedSourceLocation;
      try {
        loc = parseSourceLocation(decodeURIComponent(srcParam));
      } catch (err) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }));
        return;
      }

      // Resolve the file path against the project root
      const filePath = resolve(projectRoot, loc.file);

      // Security: prevent path traversal outside project root
      const resolvedRoot = resolve(projectRoot);
      if (!filePath.startsWith(resolvedRoot)) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Path traversal is not allowed" }));
        return;
      }

      // Read the file
      let content: string;
      try {
        content = await readFile(filePath, "utf-8");
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: `File not found: ${loc.file}` }));
          return;
        }
        throw err;
      }

      // Extract the snippet
      const { snippet, startLine, endLine } = extractSnippet(content, loc.line, contextLines);
      const language = detectLanguage(loc.file);

      const response: SnippetResponse = {
        file: loc.file,
        snippet,
        startLine,
        endLine,
        targetLine: loc.line,
        language,
      };

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(response));
    } catch (err) {
      console.error("[astro-grab] Snippet handler error:", err);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }));
    }
  };
}
