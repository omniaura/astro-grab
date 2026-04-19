import type { AstroGrabTheme } from "./types.js";

export const DEFAULT_ASTRO_GRAB_THEME: AstroGrabTheme = {
  accent: "#bc52ee",
  accentSoft: "#d8b4fe",
  surface: "#1a1a2e",
  text: "#e0e0e0",
  overlay: "rgba(188, 82, 238, 0.08)",
  border: "rgba(188, 82, 238, 0.4)",
  crosshair: "rgba(188, 82, 238, 0.4)",
  tag: "#86efac",
};

export function resolveTheme(
  theme?: Partial<AstroGrabTheme>
): AstroGrabTheme {
  if (!theme) {
    return { ...DEFAULT_ASTRO_GRAB_THEME };
  }

  const resolved = { ...DEFAULT_ASTRO_GRAB_THEME };

  for (const key of Object.keys(DEFAULT_ASTRO_GRAB_THEME) as Array<keyof AstroGrabTheme>) {
    const value = theme[key];
    if (typeof value === "string" && value.trim() !== "") {
      resolved[key] = value;
    }
  }

  return resolved;
}

export function isDefaultTheme(theme: AstroGrabTheme): boolean {
  return (
    Object.keys(DEFAULT_ASTRO_GRAB_THEME) as Array<keyof AstroGrabTheme>
  ).every((key) => theme[key] === DEFAULT_ASTRO_GRAB_THEME[key]);
}
