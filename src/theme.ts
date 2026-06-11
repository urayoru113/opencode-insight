/**
 * Centralized theme system for opencode-insight.
 * All color constants live here to ensure visual consistency across panels.
 * Box borders (customBorderChars) are intentionally excluded — each panel
 * keeps its own finely-tuned border set.
 */

export interface ThemeColors {
  // Backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  bgSelected: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textAccent: string;

  // Accents
  accent: string;
  accentHover: string;
  accentBg: string;

  // Borders
  borderPrimary: string;
  borderSecondary: string;
  borderFocus: string;

  // Semantic
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
  info: string;
  infoBg: string;
}

export const defaultTheme: ThemeColors = {
  // Tokyonight-inspired dark palette (current aesthetic)
  bgPrimary: "#1a1b26",
  bgSecondary: "#24283b",
  bgTertiary: "#2a2e3f",
  bgHover: "#2b6cb0",
  bgSelected: "#3d59a1",

  textPrimary: "#c0caf5",
  textSecondary: "#a9b1d6",
  textMuted: "#565f89",
  textAccent: "#7aa2f7",

  accent: "#7aa2f7",
  accentHover: "#bb9af7",
  accentBg: "#283457",

  borderPrimary: "#414868",
  borderSecondary: "#31364d",
  borderFocus: "#7aa2f7",

  success: "#9ece6a",
  successBg: "#283b2e",
  warning: "#e0af68",
  warningBg: "#383026",
  error: "#f7768e",
  errorBg: "#382936",
  info: "#7dcfff",
  infoBg: "#22374b",
};

/** Helper to safely access theme colors with fallback */
export function themeColor(key: keyof ThemeColors, theme: Partial<ThemeColors> = {}): string {
  return theme[key] ?? defaultTheme[key];
}

/** Category icons for sidebar and headers */
export const categoryIcons: Record<string, string> = {
  Overview: "🏠",
  "HTTP Log": "📡",
  "Token Usage": "🪙",
  "Tool Calls": "🔧",
};

/** Status indicators with color and icon */
export const statusIndicators: Record<string, { icon: string; color: keyof ThemeColors }> = {
  completed: { icon: "✓", color: "success" },
  running: { icon: "…", color: "info" },
  error: { icon: "✗", color: "error" },
  success: { icon: "✓", color: "success" },
  failed: { icon: "✗", color: "error" },
  unknown: { icon: "?", color: "warning" },
};
