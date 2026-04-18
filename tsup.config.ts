import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: "esm",
    dts: true,
    sourcemap: true,
    external: ["@astrojs/compiler", "astro", "vite"],
    outDir: "dist",
    clean: false,
  },
  {
    entry: {
      vite: "src/vite.ts",
    },
    format: "esm",
    dts: true,
    sourcemap: true,
    external: ["@astrojs/compiler", "astro", "vite"],
    outDir: "dist",
    clean: false,
  },
  {
    entry: {
      toolbar: "src/toolbar.ts",
    },
    format: "esm",
    dts: true,
    sourcemap: true,
    external: ["@astrojs/compiler", "astro", "vite"],
    outDir: "dist",
    clean: false,
  },
  {
    entry: {
      integration: "src/integration.ts",
    },
    format: "esm",
    dts: true,
    sourcemap: true,
    external: ["@astrojs/compiler", "astro", "vite", "astro-grab/vite"],
    outDir: "dist",
    clean: true,
  },
]);
