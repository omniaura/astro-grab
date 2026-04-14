/**
 * toolbar.ts
 *
 * Astro Dev Toolbar App for astro-grab settings UI.
 * Provides enable/disable toggle, activation key configuration,
 * and live status display.
 *
 * Communicates with the client runtime via CustomEvents on window:
 *   - astro-grab:toggle        { enabled: boolean }
 *   - astro-grab:config-update { key: string }
 *
 * Persists preferences to localStorage under "astro-grab-toolbar-config".
 */

// ── Types ─────────────────────────────────────────────────────────────

interface ToolbarConfig {
  enabled: boolean;
  key: string;
}

type ActivationKey = "Alt" | "Control" | "Meta" | "Shift";

// ── Constants ─────────────────────────────────────────────────────────

const STORAGE_KEY = "astro-grab-toolbar-config";

const ACTIVATION_KEYS: ActivationKey[] = ["Alt", "Control", "Meta", "Shift"];

const DEFAULT_CONFIG: ToolbarConfig = {
  enabled: true,
  key: "Alt",
};

// ── SVG Icon ──────────────────────────────────────────────────────────

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 16"/></svg>`;

// ── Persistence ───────────────────────────────────────────────────────

const getConfig = (): ToolbarConfig => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === "object" && parsed !== null) {
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          key: ACTIVATION_KEYS.includes(parsed.key) ? parsed.key : DEFAULT_CONFIG.key,
        };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_CONFIG };
};

const saveConfig = (config: ToolbarConfig): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

// ── Event dispatchers ─────────────────────────────────────────────────

const dispatchToggle = (enabled: boolean): void => {
  window.dispatchEvent(
    new CustomEvent("astro-grab:toggle", { detail: { enabled } })
  );
};

const dispatchConfigUpdate = (key: string): void => {
  window.dispatchEvent(
    new CustomEvent("astro-grab:config-update", { detail: { key } })
  );
};

// ── Toolbar App ───────────────────────────────────────────────────────

export default {
  id: "astro-grab",
  name: "Astro Grab",
  icon: ICON,

  init(canvas: ShadowRoot, eventTarget: EventTarget) {
    const config = getConfig();

    // ── Window container ────────────────────────────────────────────
    const toolbarWindow = document.createElement("astro-dev-toolbar-window");
    toolbarWindow.style.cssText = "display: flex; flex-direction: column; gap: 0;";

    // ── Header ──────────────────────────────────────────────────────
    const header = document.createElement("div");
    header.style.cssText =
      "display: flex; justify-content: space-between; align-items: center; padding: 16px 16px 12px;";

    const title = document.createElement("div");
    title.textContent = "Astro Grab";
    title.style.cssText = "font-weight: 600; font-size: 14px;";

    const statusContainer = document.createElement("div");
    statusContainer.style.cssText = "display: flex; align-items: center; gap: 8px;";

    const statusDot = document.createElement("div");
    statusDot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background-color: ${config.enabled ? "#22c55e" : "#ef4444"}; transition: background-color 0.2s;`;

    const statusText = document.createElement("div");
    statusText.textContent = config.enabled ? "Enabled" : "Disabled";
    statusText.style.cssText = "font-size: 12px; color: #d1d5db;";

    statusContainer.appendChild(statusDot);
    statusContainer.appendChild(statusText);
    header.appendChild(title);
    header.appendChild(statusContainer);

    // ── Content ─────────────────────────────────────────────────────
    const content = document.createElement("div");
    content.style.cssText =
      "padding: 0 16px 16px; display: flex; flex-direction: column; gap: 16px;";

    // ── Enable/Disable toggle ───────────────────────────────────────
    const enableSection = document.createElement("div");
    enableSection.style.cssText =
      "display: flex; justify-content: space-between; align-items: center;";

    const enableLabel = document.createElement("div");
    enableLabel.textContent = "Enable Astro Grab";
    enableLabel.style.cssText = "font-size: 13px;";

    const toggle = document.createElement(
      "astro-dev-toolbar-toggle"
    ) as HTMLInputElement & { input: HTMLInputElement; toggleStyle: string };
    toggle.toggleStyle = config.enabled ? "green" : "gray";
    toggle.input.checked = config.enabled;

    enableSection.appendChild(enableLabel);
    enableSection.appendChild(toggle);

    // ── Activation Key section ──────────────────────────────────────
    const keySection = document.createElement("div");
    keySection.style.cssText = "display: flex; flex-direction: column; gap: 8px;";

    const keyLabel = document.createElement("div");
    keyLabel.textContent = "Activation Key";
    keyLabel.style.cssText = "font-size: 13px; font-weight: 500;";

    const keyRow = document.createElement("div");
    keyRow.style.cssText =
      "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;";

    const keyButtons: Map<string, HTMLElement> = new Map();
    let currentKey = config.key;

    const createKeyButton = (key: ActivationKey): HTMLElement => {
      const btn = document.createElement(
        "astro-dev-toolbar-button"
      ) as HTMLElement & { buttonStyle: string; size: string };
      btn.textContent = key;
      btn.size = "small";
      btn.buttonStyle = key === currentKey ? "purple" : "ghost";
      btn.style.cssText = "cursor: pointer;";
      keyButtons.set(key, btn);
      return btn;
    };

    for (const key of ACTIVATION_KEYS) {
      const btn = createKeyButton(key);
      btn.addEventListener("click", () => {
        if (key === currentKey) return;

        // Update visual state
        const prevBtn = keyButtons.get(currentKey) as HTMLElement & { buttonStyle: string };
        if (prevBtn) prevBtn.buttonStyle = "ghost";
        (btn as HTMLElement & { buttonStyle: string }).buttonStyle = "purple";

        currentKey = key;
        config.key = key;
        saveConfig(config);
        dispatchConfigUpdate(key);

        // Update current key display
        currentKeyDisplay.textContent = `Hold ${key} + click to grab`;
      });
      keyRow.appendChild(btn);
    }

    const currentKeyDisplay = document.createElement("div");
    currentKeyDisplay.textContent = `Hold ${currentKey} + click to grab`;
    currentKeyDisplay.style.cssText =
      "font-size: 11px; color: #9ca3af; margin-top: 4px;";

    keySection.appendChild(keyLabel);
    keySection.appendChild(keyRow);
    keySection.appendChild(currentKeyDisplay);

    // ── Status section ──────────────────────────────────────────────
    const statusSection = document.createElement("div");
    statusSection.style.cssText =
      "display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.1);";

    const statusLabel = document.createElement("div");
    statusLabel.textContent = "Status";
    statusLabel.style.cssText = "font-size: 13px; font-weight: 500;";

    const stateRow = document.createElement("div");
    stateRow.style.cssText = "display: flex; align-items: center; gap: 8px;";

    const stateBadge = document.createElement("div");
    stateBadge.textContent = "idle";
    stateBadge.style.cssText =
      "font-size: 11px; font-family: monospace; padding: 2px 8px; border-radius: 4px; background-color: rgba(255, 255, 255, 0.1); color: #d1d5db; text-transform: uppercase; letter-spacing: 0.05em;";

    const stateDescription = document.createElement("div");
    stateDescription.textContent = "Waiting for activation key";
    stateDescription.style.cssText = "font-size: 11px; color: #9ca3af;";

    stateRow.appendChild(stateBadge);
    stateRow.appendChild(stateDescription);
    statusSection.appendChild(statusLabel);
    statusSection.appendChild(stateRow);

    // ── Assemble ────────────────────────────────────────────────────
    content.appendChild(enableSection);
    content.appendChild(keySection);
    content.appendChild(statusSection);

    toolbarWindow.appendChild(header);
    toolbarWindow.appendChild(content);
    canvas.appendChild(toolbarWindow);

    // ── Event handlers ──────────────────────────────────────────────

    const updateStatusUI = (enabled: boolean): void => {
      statusDot.style.backgroundColor = enabled ? "#22c55e" : "#ef4444";
      statusText.textContent = enabled ? "Enabled" : "Disabled";
    };

    // Toggle handler
    toggle.input.addEventListener("change", () => {
      const enabled = toggle.input.checked;
      toggle.toggleStyle = enabled ? "green" : "gray";
      config.enabled = enabled;
      saveConfig(config);
      updateStatusUI(enabled);
      dispatchToggle(enabled);

      if (!enabled) {
        stateBadge.textContent = "disabled";
        stateBadge.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
        stateBadge.style.color = "#fca5a5";
        stateDescription.textContent = "Astro Grab is disabled";
      } else {
        stateBadge.textContent = "idle";
        stateBadge.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
        stateBadge.style.color = "#d1d5db";
        stateDescription.textContent = "Waiting for activation key";
      }
    });

    // Listen for state machine transitions from the client
    window.addEventListener("astro-grab:state-change", ((
      e: CustomEvent<{ state: string }>
    ) => {
      const state = e.detail?.state;
      if (!config.enabled) return;

      if (state === "targeting") {
        stateBadge.textContent = "targeting";
        stateBadge.style.backgroundColor = "rgba(168, 85, 247, 0.2)";
        stateBadge.style.color = "#d8b4fe";
        stateDescription.textContent = "Hover over an element and click";
      } else {
        stateBadge.textContent = "idle";
        stateBadge.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
        stateBadge.style.color = "#d1d5db";
        stateDescription.textContent = "Waiting for activation key";
      }
    }) as EventListener);

    // Set initial disabled state if needed
    if (!config.enabled) {
      stateBadge.textContent = "disabled";
      stateBadge.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
      stateBadge.style.color = "#fca5a5";
      stateDescription.textContent = "Astro Grab is disabled";
      dispatchToggle(false);
    }

    // Notify the client runtime to load persisted config on init
    if (config.key !== "Alt") {
      dispatchConfigUpdate(config.key);
    }
  },
};
