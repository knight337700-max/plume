import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { CatalogChannelCode, CatalogRepository, FormatProfileRecord } from "./repositories.js";

export interface ParsedCatalogManifest { readonly channel: { readonly code: CatalogChannelCode; readonly name: string }; readonly version: string; readonly profiles: readonly Omit<FormatProfileRecord, "id" | "channelId" | "channelCode" | "revisionNo" | "sourceHash">[] }
const value = (block: string, key: string): string | undefined => block.match(new RegExp(`^\\s+${key}:\\s*([^\\n]+)`, "m"))?.[1]?.trim().replace(/^['"]|['"]$/g, "");
const scalar = (block: string, key: string, fallback: string): string => value(block, key) ?? fallback;

export function parseCatalogManifest(source: string): ParsedCatalogManifest {
  const code = source.match(/^\s+code:\s*([A-Z_]+)/m)?.[1] as CatalogChannelCode | undefined;
  const name = source.match(/^\s+name:\s*([^\n]+)/m)?.[1]?.trim() ?? code ?? "Catalog";
  if (!code) throw new Error("Catalog manifest is missing catalog.channel.code");
  const version = source.match(/^\s+version:\s*([^\n]+)/m)?.[1]?.trim() ?? "0.0.0";
  const blocks = source.split(/\n[ \t]*- id:\s*/).slice(1);
  const profiles = blocks.map((block) => {
    const id = block.split("\n", 1)[0]?.trim() ?? "";
    const stable = id.replace(/\.v[^.]+.*$/, "");
    const versionFromId = id.match(/\.(v[^.]+(?:-[^.]+)?)$/)?.[1] ?? version;
    const width = Number(block.match(/canvas:\s*\n\s+width:\s*(\d+)/)?.[1] ?? 0);
    const height = Number(block.match(/canvas:[\s\S]*?height:\s*(\d+)/)?.[1] ?? 0);
    return { stableKey: stable || id, version: versionFromId, name: scalar(block, "display_name", id), status: scalar(block, "status", "DRAFT") as FormatProfileRecord["status"], renderMode: scalar(block, "render_mode", "PLATFORM_COMPOSED"), mediaType: scalar(block, "media_type", "STATIC_IMAGE"), spec: { width, height, sourceId: id }, ruleSetId: scalar(block, "rule_set_id", `${stable}.rules`), exportRecipeId: scalar(block, "export_recipe_id", `${stable}.recipe`), ...(value(block, "effective_from") ? { effectiveFrom: value(block, "effective_from") } : {}) };
  });
  return { channel: { code, name }, version, profiles };
}

export interface SeedLoadResult { readonly channelCode: CatalogChannelCode; readonly sourceHash: string; readonly inserted: number; readonly existing: number }
export class CatalogSeedLoader {
  private readonly repository: CatalogRepository;
  constructor(repository: CatalogRepository) { this.repository = repository; }
  async load(source: string, sourceName = "catalog.yaml"): Promise<SeedLoadResult> {
    const manifest = parseCatalogManifest(source); const sourceHash = createHash("sha256").update(source).digest("hex");
    const channel = await this.repository.insertChannel({ code: manifest.channel.code, name: manifest.channel.name, status: "ACTIVE", metadata: { sourceName, sourceHash, version: manifest.version } });
    let inserted = 0; let existing = 0;
    for (const profile of manifest.profiles) { const current = await this.repository.getFormatProfileByKey(profile.stableKey, profile.version); if (current) { existing += 1; continue; } await this.repository.insertFormatProfile({ ...profile, channelId: channel.id, channelCode: channel.code, sourceHash }); inserted += 1; }
    return { channelCode: manifest.channel.code, sourceHash, inserted, existing };
  }
  async loadFiles(paths: readonly string[]): Promise<readonly SeedLoadResult[]> { const results: SeedLoadResult[] = []; for (const path of paths) results.push(await this.load(await readFile(path, "utf8"), path)); return results; }
}
