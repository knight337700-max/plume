import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync(
  fileURLToPath(new URL("./plume-theme.css", import.meta.url)),
  "utf8",
);

const mappedTokens = [
  "--plume-surface-app-body",
  "--plume-surface-primary",
  "--plume-surface-card",
  "--plume-content-text-primary",
  "--plume-content-text-secondary",
  "--plume-border-default",
  "--plume-color-accent",
  "--plume-color-accent-hover",
  "--plume-color-success",
  "--plume-color-warning",
  "--plume-color-error",
  "--plume-color-processing-text",
  "--plume-color-neutral-text",
  "--plume-spacing-4",
  "--plume-size-element-md",
  "--plume-radius-element",
  "--plume-shadow-focus-selected",
  "--plume-duration-panel",
] as const;

describe("Plume token mapping", () => {
  it("maps semantic Plume tokens to Astryx variables", () => {
    for (const token of mappedTokens) {
      expect(themeCss).toContain(`${token}: var(--`);
    }
  });

  it("does not introduce raw color literals", () => {
    expect(themeCss).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
