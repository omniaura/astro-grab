/**
 * astro-grab/integration
 *
 * Astro integration that wires up the Vite plugin and runtime injection.
 *
 * Usage in astro.config.mjs:
 *
 *   import { defineConfig } from "astro/config";
 *   import astroGrab from "@omniaura/astro-grab";
 *
 *   export default defineConfig({
 *     integrations: [astroGrab()],
 *   });
 */

import type { AstroIntegration } from "astro";
import { resolveTheme } from "./theme.js";
import { STORAGE_KEY } from "./toolbar.js";
import type { AstroGrabIntegrationOptions } from "./types.js";
import astroGrabVite from "./vite.js";

export { DEFAULT_ASTRO_GRAB_THEME } from "./theme.js";
export type { AstroGrabTheme } from "./types.js";

export default function astroGrab(
  options: AstroGrabIntegrationOptions = {}
): AstroIntegration {
  const {
    jsxLocation = true,
    componentLocation = true,
    autoImport = true,
    key = "Alt",
    theme,
  } = options;

  const resolvedTheme = resolveTheme(theme);

  return {
    name: "astro-grab",
    hooks: {
      "astro:config:setup"({
        updateConfig,
        command,
        addDevToolbarApp,
        injectScript,
      }) {
        // Only activate in dev mode
        if (command !== "dev") return;

        if (autoImport) {
          injectScript(
            "page",
            [
              `import { initAstroGrab } from "@omniaura/astro-grab/client";`,
              `const storageKey = ${JSON.stringify(STORAGE_KEY)};`,
              `const configuredKey = ${JSON.stringify(key)};`,
              `const configuredTheme = ${JSON.stringify(resolvedTheme)};`,
              `const validKeys = new Set(["Alt", "Control", "Meta", "Shift"]);`,
              `const readToolbarConfig = () => {`,
              `  try {`,
              `    const stored = localStorage.getItem(storageKey);`,
              `    if (!stored) return null;`,
              `    const parsed = JSON.parse(stored);`,
              `    return typeof parsed === "object" && parsed !== null ? parsed : null;`,
              `  } catch {`,
              `    return null;`,
              `  }`,
              `};`,
              `const toolbarConfig = readToolbarConfig();`,
              `const activationKey = validKeys.has(toolbarConfig?.key) ? toolbarConfig.key : configuredKey;`,
              `initAstroGrab({ key: activationKey, theme: configuredTheme });`,
              `if (toolbarConfig?.enabled === false) {`,
              `  const disable = () => {`,
              `    window.dispatchEvent(new CustomEvent("astro-grab:toggle", { detail: { enabled: false } }));`,
              `  };`,
              `  if (document.readyState === "loading") {`,
              `    document.addEventListener("DOMContentLoaded", () => queueMicrotask(disable), { once: true });`,
              `  } else {`,
              `    queueMicrotask(disable);`,
              `  }`,
              `}`,
            ].join("\n")
          );
        }

        updateConfig({
          vite: {
            plugins: [
              astroGrabVite({
                jsxLocation,
                componentLocation,
                autoImport: false,
                key,
                theme: resolvedTheme,
              }),
            ],
          },
        });

        // Register the Astro Dev Toolbar settings UI
        addDevToolbarApp({
          id: "astro-grab",
          name: "Astro Grab",
          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 16"/></svg>`,
          entrypoint: new URL("./toolbar.js", import.meta.url).href,
        });
      },
    },
  };
}
