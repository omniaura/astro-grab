import { parse } from "@astrojs/compiler";

import { ATTR_SOURCE } from "./types.js";

type AstroTransformOptions = {
  jsxLocation: boolean;
  componentLocation: boolean;
};

type AstroNode = {
  type?: string;
  name?: string;
  position?: {
    start?: {
      offset?: number;
    };
  };
  children?: AstroNode[];
  attributes?: AstroNode[];
};

type Injection = {
  offset: number;
  attribute: string;
};

const COMPONENT_NAME_RE = /^[A-Z]|[.]/;
const NON_INSTRUMENTABLE_TAGS = new Set(["script", "style", "body"]);

function computeLineStarts(code: string): number[] {
  const lineStarts = [0];
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

function normalizeFilePath(fileId: string): string {
  return fileId.replace(/\\/g, "/").replace(/^\//, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTagInsertOffset(
  code: string,
  tagName: string,
  startOffset: number,
): number | null {
  const tagPrefix = `<${tagName}`;
  let tagStart = startOffset;

  while (
    tagStart > 0 &&
    code.slice(tagStart, tagStart + tagPrefix.length) !== tagPrefix
  ) {
    tagStart--;
  }

  if (tagStart === 0 && code.slice(0, tagPrefix.length) !== tagPrefix) {
    return null;
  }

  let tagEnd = tagStart;
  let depth = 0;
  for (let i = tagStart; i < code.length; i++) {
    if (code[i] === "<") depth++;
    if (code[i] === ">") {
      depth--;
      if (depth === 0) {
        tagEnd = i;
        break;
      }
    }
  }

  const openingTag = code.slice(tagStart, tagEnd + 1);
  const tagPattern = new RegExp(`^<${escapeRegExp(tagName)}([\\s>/])`);
  const match = openingTag.match(tagPattern);
  if (!match) return null;

  if (openingTag.includes(`${ATTR_SOURCE}=`)) {
    return null;
  }

  return tagStart + match[0].length - 1;
}

function findBodyNode(node: AstroNode): AstroNode | null {
  if (node.type === "element" && node.name === "body") {
    return node;
  }

  if (!Array.isArray(node.children)) return null;

  for (const child of node.children) {
    const found = findBodyNode(child);
    if (found) return found;
  }

  return null;
}

function walkAst(node: AstroNode, visit: (node: AstroNode) => void): void {
  if (!node || typeof node !== "object") return;

  visit(node);

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walkAst(child, visit);
    }
  }

  if (Array.isArray(node.attributes)) {
    for (const attr of node.attributes) {
      walkAst(attr, visit);
    }
  }
}

export async function transformAstroFile(
  code: string,
  fileId: string,
  opts: AstroTransformOptions,
): Promise<string> {
  if (!opts.jsxLocation) {
    return code;
  }

  let parsed: { ast: AstroNode };
  try {
    parsed = await parse(code, { position: true });
  } catch {
    return code;
  }

  const root = findBodyNode(parsed.ast) ?? parsed.ast;
  const shortFile = normalizeFilePath(fileId);
  const lineStarts = computeLineStarts(code);
  const injections: Injection[] = [];

  walkAst(root, (node) => {
    if (node.type !== "element" || !node.name) return;

    const normalizedTagName = node.name.toLowerCase();
    if (NON_INSTRUMENTABLE_TAGS.has(normalizedTagName)) return;

    if (COMPONENT_NAME_RE.test(node.name)) {
      return;
    }

    const startOffset = node.position?.start?.offset;
    if (typeof startOffset !== "number") return;

    const insertOffset = findTagInsertOffset(code, node.name, startOffset);
    if (insertOffset === null) return;

    const [line, col] = getLineCol(lineStarts, startOffset);
    injections.push({
      offset: insertOffset,
      attribute: ` ${ATTR_SOURCE}="${shortFile}:${line}:${col}"`,
    });
  });

  if (injections.length === 0) {
    return code;
  }

  injections.sort((a, b) => b.offset - a.offset);

  let transformed = code;
  for (const injection of injections) {
    transformed =
      transformed.slice(0, injection.offset) +
      injection.attribute +
      transformed.slice(injection.offset);
  }

  return transformed;
}
