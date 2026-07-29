import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as adapter from "./index";

const sourceRoot = join(fileURLToPath(import.meta.url), "..", "..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Astryx adapter boundary", () => {
  it("exports the provider and approved primitives from the UI package", () => {
    expect(adapter.AstryxProvider).toBeTypeOf("function");
    expect(adapter.AstryxAppShell).toBeDefined();
    expect(adapter.AstryxButton).toBeDefined();
    expect(adapter.AstryxDialog).toBeDefined();
  });

  it("keeps direct Astryx imports inside the adapter directory", () => {
    const violations = sourceFiles(sourceRoot)
      .filter((file) => !file.includes(`${sep}astryx${sep}`))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return /from\s+["']@astryxdesign\//.test(source) ? [file] : [];
      });

    expect(violations).toEqual([]);
  });
});
