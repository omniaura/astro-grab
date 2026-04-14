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
      "astro:config:setup"({ updateConfig, command }) {
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
      },
    },
  };
}
