export const plumeThemeTokens = {
  accent: "--plume-color-accent",
  accentHover: "--plume-color-accent-hover",
  accentMuted: "--plume-color-accent-muted",
  error: "--plume-color-error",
  processing: "--plume-color-processing-text",
  success: "--plume-color-success",
  warning: "--plume-color-warning",
} as const;

export type PlumeThemeToken =
  (typeof plumeThemeTokens)[keyof typeof plumeThemeTokens];
