/**
 * Semantic theme contract shared by every Memory frontend surface.
 *
 * Components consume roles, never palette values. The checked-in desktop CSS
 * mirrors this contract so the complete theme is available before JavaScript.
 */
export const graphiteCopperLight = {
  background: "#F7F3EE",
  surface: "#FFFDF9",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#EFE5DA",
  surface2: "#EFE5DA",
  overlay: "rgba(17, 16, 15, 0.58)",
  text: "#241E1A",
  textMuted: "#6D5D52",
  muted: "#6D5D52",
  textDisabled: "#675B52",
  border: "#CDBAA7",
  borderStrong: "#8A7665",
  accent: "#875018",
  onAccent: "#FFFDF9",
  accentSubtle: "#F3E1CF",
  onAccentSubtle: "#4D2A09",
  accentSoft: "#F3E1CF",
  danger: "#8F2F20",
  onDanger: "#FFFDF9",
  dangerSubtle: "#F9DED8",
  onDangerSubtle: "#5B180F",
  success: "#2F6B3C",
  onSuccess: "#FFFDF9",
  successSubtle: "#DDECDD",
  onSuccessSubtle: "#173D21",
  warning: "#7D4B00",
  onWarning: "#FFFDF9",
  warningSubtle: "#F5E3BF",
  onWarningSubtle: "#4C2B00",
  information: "#255D86",
  onInformation: "#FFFDF9",
  informationSubtle: "#DCEAF5",
  onInformationSubtle: "#123A59",
  focusRing: "#0B61A4",
  focusOffset: "#FFFDF9"
} as const;

export const graphiteCopperDark = {
  background: "#11100F",
  surface: "#1B1815",
  surfaceRaised: "#24201C",
  surfaceSunken: "#28221D",
  surface2: "#28221D",
  overlay: "rgba(0, 0, 0, 0.72)",
  text: "#F7F1EA",
  textMuted: "#C1B0A2",
  muted: "#C1B0A2",
  textDisabled: "#A8998D",
  border: "#594A3E",
  borderStrong: "#8D7969",
  accent: "#F0AD72",
  onAccent: "#2A1607",
  accentSubtle: "#4A2E18",
  onAccentSubtle: "#FFE4CB",
  accentSoft: "#4A2E18",
  danger: "#FF9A83",
  onDanger: "#2A0D08",
  dangerSubtle: "#4B2019",
  onDangerSubtle: "#FFDCD4",
  success: "#9BCB98",
  onSuccess: "#0D2110",
  successSubtle: "#203D26",
  onSuccessSubtle: "#DDF2DD",
  warning: "#F2BF6E",
  onWarning: "#2C1B02",
  warningSubtle: "#493516",
  onWarningSubtle: "#FFE7B4",
  information: "#94C7FF",
  onInformation: "#071B31",
  informationSubtle: "#193852",
  onInformationSubtle: "#DCEEFF",
  focusRing: "#78C6FF",
  focusOffset: "#11100F"
} as const;

export const semanticScale = {
  space: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem"
  },
  type: {
    familyBody: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    familyMono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    sizeCaption: "0.75rem",
    sizeBodySmall: "0.875rem",
    sizeBody: "1rem",
    sizeTitle: "1.25rem",
    sizeHeading: "1.5rem",
    lineCompact: "1.25",
    lineBody: "1.5",
    lineReading: "1.7",
    weightRegular: "400",
    weightMedium: "600",
    weightStrong: "700"
  },
  radius: {
    small: "0.375rem",
    medium: "0.5rem",
    large: "0.75rem",
    pill: "999px"
  },
  elevation: {
    small: "0 0.25rem 0.875rem rgba(17, 16, 15, 0.14)",
    panel: "0 0.625rem 1.5rem rgba(17, 16, 15, 0.08)",
    node: "0 0.5rem 1.125rem rgba(17, 16, 15, 0.16)",
    nodeActive: "0 0.625rem 1.5rem rgba(17, 16, 15, 0.22)",
    popover: "0 1rem 2.5rem rgba(17, 16, 15, 0.2)",
    dialog: "0 1.5rem 5rem rgba(0, 0, 0, 0.34)"
  },
  layer: {
    base: "0",
    sticky: "10",
    popover: "30",
    dialog: "50",
    nestedDialog: "60",
    announcement: "70"
  },
  motion: {
    durationInstant: "0ms",
    durationFast: "120ms",
    durationNormal: "200ms",
    durationSlow: "320ms",
    easingStandard: "cubic-bezier(0.2, 0, 0, 1)",
    easingEmphasized: "cubic-bezier(0.2, 0, 0, 1.2)"
  },
  focus: {
    width: "3px",
    offset: "2px"
  }
} as const;

/** Registered foreground/background pairs. Every theme must satisfy WCAG AA. */
export const semanticContrastPairs = [
  ["text", "background"],
  ["text", "surface"],
  ["textMuted", "background"],
  ["textMuted", "surface"],
  ["textDisabled", "surface"],
  ["onAccent", "accent"],
  ["onAccentSubtle", "accentSubtle"],
  ["onDanger", "danger"],
  ["onDangerSubtle", "dangerSubtle"],
  ["onSuccess", "success"],
  ["onSuccessSubtle", "successSubtle"],
  ["onWarning", "warning"],
  ["onWarningSubtle", "warningSubtle"],
  ["onInformation", "information"],
  ["onInformationSubtle", "informationSubtle"]
] as const;

/**
 * Deliberately separate categorical palette for data visualisation only.
 * Each entry carries its own readable text color; it is not a UI-state token.
 */
export const dataVisualizationPalette = [
  { fill: "#E0E7FF", accent: "#4F46E5", text: "#312E81" },
  { fill: "#DCFCE7", accent: "#15803D", text: "#14532D" },
  { fill: "#FEF3C7", accent: "#B45309", text: "#78350F" },
  { fill: "#FCE7F3", accent: "#BE185D", text: "#831843" },
  { fill: "#EDE9FE", accent: "#6D28D9", text: "#4C1D95" },
  { fill: "#CCFBF1", accent: "#0F766E", text: "#134E4A" }
] as const;

export type MemoryTheme = typeof graphiteCopperLight | typeof graphiteCopperDark;
