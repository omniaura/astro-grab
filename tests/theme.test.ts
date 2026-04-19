import { describe, expect, it } from "bun:test";
import { DEFAULT_ASTRO_GRAB_THEME, isDefaultTheme, resolveTheme } from "../src/theme.js";

describe("theme helpers", () => {
  it("returns the built-in theme when no overrides are provided", () => {
    expect(resolveTheme()).toEqual(DEFAULT_ASTRO_GRAB_THEME);
  });

  it("merges partial overrides onto the built-in theme", () => {
    expect(resolveTheme({ accent: "#00ffaa", surface: "#101010" })).toEqual({
      ...DEFAULT_ASTRO_GRAB_THEME,
      accent: "#00ffaa",
      surface: "#101010",
    });
  });

  it("ignores blank theme values", () => {
    expect(resolveTheme({ accent: "   " })).toEqual(DEFAULT_ASTRO_GRAB_THEME);
  });

  it("detects whether the active theme matches defaults", () => {
    expect(isDefaultTheme(DEFAULT_ASTRO_GRAB_THEME)).toBe(true);
    expect(isDefaultTheme(resolveTheme({ accent: "#00ffaa" }))).toBe(false);
  });
});
