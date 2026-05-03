// ── Source location metadata ──────────────────────────────────────────

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface ComponentInfo {
  name: string;
  location: SourceLocation | null;
}

// ── Snippet response from server ─────────────────────────────────────

export interface SnippetResponse {
  /** Relative file path */
  file: string;
  /** Extracted source code lines */
  snippet: string;
  /** First line number in the snippet (1-based) */
  startLine: number;
  /** Last line number in the snippet (1-based) */
  endLine: number;
  /** The target line number that was requested (1-based) */
  targetLine: number;
  /** Language identifier derived from file extension */
  language: string;
}

// ── Grabbed context payload ──────────────────────────────────────────

export interface GrabbedContext {
  /** The DOM element that was clicked */
  element: HTMLElement;
  /** Tag name of the element */
  tagName: string;
  /** Source location of the clicked element's JSX/template */
  elementSource: SourceLocation | null;
  /** Component ancestry chain, innermost first */
  components: ComponentInfo[];
  /** Formatted string ready for an AI agent prompt */
  formatted: string;
  /** Timestamp */
  timestamp: number;
  /** Server-side source code snippet, if available */
  snippet?: SnippetResponse;
}

// ── Configuration ────────────────────────────────────────────────────

export interface AstroGrabTheme {
  /** Primary accent used for outlines and emphasis. */
  accent: string;
  /** Softer accent used for badge and component labels. */
  accentSoft: string;
  /** Background color for tooltip, toast, and badge surfaces. */
  surface: string;
  /** Primary text color for overlay UI. */
  text: string;
  /** Highlight tint drawn over the targeted element. */
  overlay: string;
  /** Border color for tooltip, toast, and badge surfaces. */
  border: string;
  /** Crosshair guide line color. */
  crosshair: string;
  /** Element tag color inside the tooltip. */
  tag: string;
}

export interface AstroGrabOptions {
  /**
   * Key to hold while hovering to activate the overlay.
   * @default "Alt"
   */
  key?: "Alt" | "Control" | "Meta" | "Shift";

  /**
   * Callback fired when an element is grabbed.
   * Return `false` to prevent the default clipboard copy.
   */
  onGrab?: (context: GrabbedContext) => void | false;

  /**
   * WebSocket URL for agent bridge.
   * If provided, grabbed context is also sent over WS.
   * @default undefined
   */
  agentUrl?: string;

  /**
   * Whether to show a toast notification on copy.
   * @default true
   */
  showToast?: boolean;

  /**
   * Override the overlay look and feel.
   * Omitted values fall back to the built-in OmniAura theme.
   */
  theme?: Partial<AstroGrabTheme>;

  /**
   * Clipboard template with `{{variable}}` placeholders.
   * Omitted value falls back to the built-in astro-grab context format.
   */
  template?: string;
}

// ── Astro integration options ────────────────────────────────────────

export interface AstroGrabIntegrationOptions {
  /**
   * Inject `data-astro-source` attributes into template elements.
   * @default true
   */
  jsxLocation?: boolean;

  /**
   * Inject `data-astro-component` attributes onto component root elements.
   * @default true
   */
  componentLocation?: boolean;

  /**
   * Auto-import the astro-grab runtime in dev mode.
   * @default true
   */
  autoImport?: boolean;

  /**
   * Activation key to hold while hovering to grab elements.
   * Passed through to the dev runtime bootstrap.
   * @default "Alt"
   */
  key?: "Alt" | "Control" | "Meta" | "Shift";

  /**
   * Override the runtime overlay theme.
   * Omitted values fall back to the built-in OmniAura theme.
   */
  theme?: Partial<AstroGrabTheme>;

  /**
   * Clipboard template passed through to the dev runtime bootstrap.
   * Omitted value falls back to the built-in astro-grab context format.
   */
  template?: string;
}

// ── Vite plugin options (internal, used by integration) ──────────────

export interface AstroGrabViteOptions {
  /**
   * Inject `data-astro-source` attributes into JSX/template elements.
   * @default true
   */
  jsxLocation?: boolean;

  /**
   * Inject `data-astro-component` attributes onto component root elements.
   * @default true
   */
  componentLocation?: boolean;

  /**
   * Auto-import the astro-grab runtime in dev mode.
   * @default true
   */
  autoImport?: boolean;

  /**
   * Activation key to hold while hovering to grab elements.
   * Passed through to the dev runtime bootstrap.
   * @default "Alt"
   */
  key?: "Alt" | "Control" | "Meta" | "Shift";

  /**
   * Override the runtime overlay theme.
   * Omitted values fall back to the built-in OmniAura theme.
   */
  theme?: Partial<AstroGrabTheme>;

  /**
   * Clipboard template passed through to the dev runtime bootstrap.
   * Omitted value falls back to the built-in astro-grab context format.
   */
  template?: string;
}

// ── Data attribute names ─────────────────────────────────────────────

export const ATTR_SOURCE = "data-astro-source";
export const ATTR_COMPONENT = "data-astro-component";
