import path from "node:path";

import { GlobalFonts } from "@napi-rs/canvas";

import type { ContractBundle } from "./contracts.js";
import { FONT_ALIAS_BOLD, FONT_ALIAS_REGULAR } from "./constants.js";
import { createIssue } from "./errors.js";
import { sha256File } from "./hash.js";
import type { AssetDigest, ValidationIssue } from "./types.js";

export type RuntimeAssets = {
  boldFontPath: string;
  regularFontPath: string;
  fontDigests: AssetDigest[];
  referenceDigest: AssetDigest;
};

const registeredFontKeys = new Set<string>();

function registerPinnedFont(fontPath: string, alias: string): boolean {
  const key = `${fontPath}\u0000${alias}`;
  if (registeredFontKeys.has(key)) return true;
  const result = GlobalFonts.registerFromPath(fontPath, alias);
  if (result === null) return false;
  registeredFontKeys.add(key);
  return true;
}

export async function verifyRuntimeAssets(
  projectRoot: string,
  contracts: ContractBundle,
): Promise<{ assets?: RuntimeAssets; issues: ValidationIssue[] }> {
  const issues: ValidationIssue[] = [];
  if (contracts.fontRegistry.status !== "RESOLVED_ASSET" || contracts.fontRegistry.renderingBlocker) {
    issues.push(createIssue(contracts.errorRegistry, "KBR-SYSTEM-001", "/assets/fonts"));
    return { issues };
  }

  let boldFontPath: string | undefined;
  let regularFontPath: string | undefined;
  const fontDigests: AssetDigest[] = [];

  for (const asset of contracts.fontRegistry.requiredAssets) {
    if (asset.status !== "RESOLVED_ASSET" || asset.relativePath === null || asset.sha256 === null) {
      issues.push(createIssue(contracts.errorRegistry, "KBR-SYSTEM-001", `/assets/fonts/${asset.id}`));
      continue;
    }
    const assetPath = path.join(projectRoot, ...asset.relativePath.split("/"));
    try {
      const digest = await sha256File(assetPath);
      if (digest !== asset.sha256) {
        issues.push(
          createIssue(contracts.errorRegistry, "KBR-SYSTEM-002", `/assets/fonts/${asset.id}`, {
            expected: asset.sha256,
            actual: digest,
          }),
        );
        continue;
      }
      fontDigests.push({ id: asset.id, sha256: digest });
      if (asset.id === "SPOQA_HAN_SANS_BOLD") boldFontPath = assetPath;
      if (asset.id === "SPOQA_HAN_SANS_REGULAR") regularFontPath = assetPath;
    } catch {
      issues.push(createIssue(contracts.errorRegistry, "KBR-SYSTEM-001", `/assets/fonts/${asset.id}`));
    }
  }

  const referencePath = path.join(projectRoot, ...contracts.referenceRegistry.fixture.path.split("/"));
  let referenceDigest: AssetDigest | undefined;
  try {
    const digest = await sha256File(referencePath);
    if (digest !== contracts.referenceRegistry.fixture.sha256) {
      issues.push(
        createIssue(contracts.errorRegistry, "KBR-ASSET-007", "/referenceFixture", {
          expected: contracts.referenceRegistry.fixture.sha256,
          actual: digest,
        }),
      );
    } else {
      referenceDigest = { id: contracts.referenceRegistry.fixture.id, sha256: digest };
    }
  } catch {
    issues.push(createIssue(contracts.errorRegistry, "KBR-ASSET-001", "/referenceFixture"));
  }

  if (issues.length > 0 || !boldFontPath || !regularFontPath || !referenceDigest) return { issues };
  if (!registerPinnedFont(boldFontPath, FONT_ALIAS_BOLD) || !registerPinnedFont(regularFontPath, FONT_ALIAS_REGULAR)) {
    return { issues: [createIssue(contracts.errorRegistry, "KBR-SYSTEM-003", "/assets/fonts")] };
  }

  return {
    assets: {
      boldFontPath,
      regularFontPath,
      fontDigests: fontDigests.sort((left, right) => left.id.localeCompare(right.id, "en")),
      referenceDigest,
    },
    issues,
  };
}
