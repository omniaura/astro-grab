/**
 * astro-grab/integration
 *
 * Astro integration that wires up the Vite plugin and runtime injection.
 *
 * Usage in astro.config.mjs:
 *
 *   import { defineConfig } from "astro/config";
 *   import astroGrab from "astro-grab";
 *
 *   export default defineConfig({
 *     integrations: [astroGrab()],
 *   });
 */

import type { AstroIntegration } from "astro";
import type { AstroGrabIntegrationOptions } from "./types.js";
import astroGrabVite from "./vite.js";

export default function astroGrab(
  options: AstroGrabIntegrationOptions = {}
): AstroIntegration {
  const {
    jsxLocation = true,
    componentLocation = true,
    autoImport = true,
    key = "Alt",
  } = options;

  return {
    name: "astro-grab",
    hooks: {
      "astro:config:setup"({ updateConfig, command, addDevToolbarApp }) {
        // Only activate in dev mode
        if (command !== "dev") return;

        updateConfig({
          vite: {
            plugins: [
              astroGrabVite({
                jsxLocation,
                componentLocation,
                autoImport,
                key,
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
