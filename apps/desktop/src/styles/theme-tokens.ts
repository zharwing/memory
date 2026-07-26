import { graphiteCopperDark, graphiteCopperLight } from "@zharwing/memory-theme";

type ThemeTokens = typeof graphiteCopperLight;

/**
 * Maps a theme token key to its CSS custom property name, e.g.
 * `accentSoft` -> `--accent-soft`, `surface2` -> `--surface-2`.
 */
function cssVariableName(token: string): string {
  return `--${token.replace(/([A-Z])/g, "-$1").replace(/(\d+)/g, "-$1").toLowerCase()}`;
}

function tokenDeclarations(tokens: ThemeTokens, indent: string): string {
  return Object.entries(tokens)
    .map(([token, value]) => `${indent}${cssVariableName(token)}: ${value};`)
    .join("\n");
}

/**
 * Generates the light/dark custom-property blocks previously hardcoded in
 * global.css, using the same selector structure (`:root` plus a
 * `prefers-color-scheme: dark` media query override).
 */
export function themeStyleCss(): string {
  return [
    ":root {",
    "  color-scheme: light;",
    tokenDeclarations(graphiteCopperLight, "  "),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    "    color-scheme: dark;",
    tokenDeclarations(graphiteCopperDark, "    "),
    "  }",
    "}"
  ].join("\n");
}

/** Injects the theme token stylesheet. Must run before the first render. */
export function injectThemeStyles(): void {
  const style = document.createElement("style");
  style.setAttribute("data-theme-tokens", "graphite-copper");
  style.textContent = themeStyleCss();
  document.head.appendChild(style);
}
