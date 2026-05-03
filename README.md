# astro-grab

Hold a key, hover, click — grab any element's source context for AI agents. Astro devtool inspired by [solid-grab](https://github.com/omniaura/solid-grab) and [react-grab](https://github.com/aidenybai/react-grab).

## Install

```bash
bun add -D @omniaura/astro-grab
# or
npm install -D @omniaura/astro-grab
```

## Setup

Add the integration to your `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import astroGrab from "@omniaura/astro-grab";

export default defineConfig({
  integrations: [astroGrab()],
});
```

That's it. In dev mode, hold **Alt** and click any element to copy its source context to your clipboard.

## How It Works

**Build time:** A Vite plugin injects `data-astro-source` and `data-astro-component` attributes into your `.astro` templates and framework island JSX/TSX files.

**Runtime:** An overlay activates when you hold the modifier key. Hover to see source info, click to grab full context.

**Output:** Formatted context (element, source location, component tree, HTML snippet) is copied to clipboard — ready to paste into Claude, Cursor, or any AI coding agent.

```
--- astro-grab context ---

Element: <button class="btn primary">
Source:  src/components/Counter.astro:24:8

Component tree (innermost → outermost):
  <Counter /> → src/components/Counter.astro:12:1
  <Layout /> → src/layouts/Layout.astro:8:1

HTML:
<button class="btn primary" data-astro-source="src/components/Counter.astro:24:8">Count: 5</button>

--- end astro-grab context ---
```

## Options

### Integration Options

```js
astroGrab({
  jsxLocation: true,      // Inject data-astro-source (default: true)
  componentLocation: true, // Inject data-astro-component (default: true)
  autoImport: true,        // Auto-import runtime in dev (default: true)
  key: "Alt",              // Modifier key: "Alt" | "Control" | "Meta" | "Shift"
  holdDuration: 0,         // ms to hold key before activation (default: 0 = instant)
  theme: {
    accent: "#bc52ee",     // Optional theme overrides
    surface: "#1a1a2e",
  },
})
```

### Runtime Options

For manual initialization (if `autoImport: false`):

```js
import { initAstroGrab } from "@omniaura/astro-grab/client";

initAstroGrab({
  key: "Alt",              // Modifier key (default: "Alt")
  showToast: true,         // Show notification on copy (default: true)
  holdDuration: 0,         // ms to hold key before activation (default: 0 = instant)
  agentUrl: "ws://...",    // WebSocket URL for agent bridge (optional)
  onGrab: (context) => {}, // Callback, return false to prevent copy
  theme: {
    accent: "#bc52ee",
    surface: "#1a1a2e",
  },
});

// Set holdDuration > 0 (e.g. 1000) to require holding the key for 1s
// before targeting activates — useful to prevent accidental activation
// when the modifier is pressed for unrelated browser shortcuts.
```

### Theme Defaults

`astro-grab` now exposes its built-in OmniAura palette so you can extend it instead of re-creating it:

```js
import astroGrab, { DEFAULT_ASTRO_GRAB_THEME } from "@omniaura/astro-grab";

export default defineConfig({
  integrations: [
    astroGrab({
      key: "Alt",
      theme: {
        ...DEFAULT_ASTRO_GRAB_THEME,
        accent: "#ff7a59",
        accentSoft: "#ffd1c2",
      },
    }),
  ],
});
```

Available theme keys:

- `accent`
- `accentSoft`
- `surface`
- `text`
- `overlay`
- `border`
- `crosshair`
- `tag`

### Agent Bridge

Send grabbed context directly to a local coding agent over WebSocket:

```js
astroGrab({
  // Options are passed through to the runtime
  key: "Alt",
})
```

Then in your client code:

```js
import { initAstroGrab } from "@omniaura/astro-grab/client";

initAstroGrab({
  agentUrl: "ws://localhost:4567",
});
```

The bridge sends JSON payloads:

```json
{
  "type": "astro-grab:context",
  "payload": {
    "tagName": "button",
    "elementSource": { "file": "src/...", "line": 24, "column": 8 },
    "components": [...],
    "formatted": "--- astro-grab context ---\n...",
    "timestamp": 1234567890
  }
}
```

## Standalone Vite Plugin

If you're not using the Astro integration (e.g., in a plain Vite project):

```js
import { defineConfig } from "vite";
import astroGrab from "@omniaura/astro-grab/vite";

export default defineConfig({
  plugins: [astroGrab()],
});
```

## Global API

Access the runtime programmatically via `window.__ASTRO_GRAB__`:

```js
window.__ASTRO_GRAB__.init({ key: "Control" });
window.__ASTRO_GRAB__.destroy();
window.__ASTRO_GRAB__.inspect(document.querySelector(".my-element"));
console.log(window.__ASTRO_GRAB__.theme);
```

## Dev Only

The integration and Vite plugin only activate during `astro dev` / `vite serve`. Production builds are completely unaffected — no attributes injected, no runtime loaded.

## License

MIT
