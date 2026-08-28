export const assetRoleCodes = [
  "LOGO",
  "MODEL",
  "PRODUCT",
  "KEY_VISUAL",
  "BACKGROUND",
  "BADGE",
  "GRAPHIC",
  "REFERENCE",
] as const;

export type AssetRoleCode = (typeof assetRoleCodes)[number];

export function isAssetRoleCode(value: string): value is AssetRoleCode {
  return (assetRoleCodes as readonly string[]).includes(value);
}
