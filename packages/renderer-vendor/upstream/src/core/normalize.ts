import path from "node:path";

import type { CanonicalCtaInput, CanonicalInput, CtaInput, KakaoBizboardInputV1 } from "./types.js";

function normalizeCommonString(value: string): string {
  return value.normalize("NFC").trim();
}

function normalizeCopyString(value: string): string {
  return normalizeCommonString(value);
}

function normalizeRelativeReference(value: string): string {
  const normalized = normalizeCommonString(value).replaceAll("\\", "/");
  return path.posix.normalize(normalized);
}

function materializeCta(cta: CtaInput): CanonicalCtaInput {
  switch (cta.mode) {
    case "NONE":
      return { ...cta, label: null, iconPath: null };
    case "APP_DOWNLOAD":
      return { ...cta };
    case "KAKAO_SERVICE_ACTION":
      return { ...cta, iconPath: cta.iconPath ?? null };
  }
}

function normalizeCta(cta: CanonicalCtaInput): CanonicalCtaInput {
  switch (cta.mode) {
    case "NONE":
      return { ...cta };
    case "APP_DOWNLOAD":
      return {
        ...cta,
        label: normalizeCopyString(cta.label),
        iconPath: normalizeRelativeReference(cta.iconPath),
      };
    case "KAKAO_SERVICE_ACTION":
      return {
        ...cta,
        label: normalizeCopyString(cta.label),
        iconPath: cta.iconPath === null ? null : normalizeRelativeReference(cta.iconPath),
      };
  }
}

export function applyDefaults(input: KakaoBizboardInputV1): CanonicalInput {
  return {
    ...structuredClone(input),
    canvas: input.canvas ?? { width: 1029, height: 258 },
    advertiser: { ...input.advertiser },
    copy: { ...input.copy },
    cta: materializeCta(input.cta),
    assets: {
      product: {
        path: input.assets.product.path,
        expectedSha256: input.assets.product.expectedSha256 ?? null,
        alphaTrim: true,
      },
    },
    render: {
      templateContractVersion: "1.9.0",
      includeDebugOverlay: false,
      pixelRatio: 1,
    },
    output: {
      directory: input.output.directory,
      baseName: input.output.baseName,
      overwrite: input.output.overwrite ?? false,
    },
  };
}

export function normalizeInput(input: CanonicalInput): CanonicalInput {
  return {
    ...input,
    advertiser: {
      ...input.advertiser,
      text: normalizeCopyString(input.advertiser.text),
    },
    copy: {
      headline: normalizeCopyString(input.copy.headline),
      subcopy: normalizeCopyString(input.copy.subcopy),
    },
    cta: normalizeCta(input.cta),
    assets: {
      product: {
        ...input.assets.product,
        path: normalizeRelativeReference(input.assets.product.path),
        expectedSha256: input.assets.product.expectedSha256?.toLowerCase() ?? null,
      },
    },
    output: {
      ...input.output,
      directory: normalizeRelativeReference(input.output.directory),
      baseName: normalizeCommonString(input.output.baseName),
    },
  };
}
