import { resolve } from "node:path";
import { createInMemoryCatalogRepository } from "../../packages/core/src/modules/media-catalog/repositories.ts";
import { CatalogSeedLoader } from "../../packages/core/src/modules/media-catalog/seed-loader.ts";

export const catalogSeedFiles = ["naver-format-catalog.yaml", "kakao-format-catalog.yaml", "meta-format-catalog.yaml", "google-format-catalog.yaml"] as const;
export async function loadDesignCatalog(root = process.env.PLUME_DESIGN_ROOT ?? "C:/Users/Lenovo/Desktop/da-creative-webapp-design/03_seed-data") {
  const repository = createInMemoryCatalogRepository(); const loader = new CatalogSeedLoader(repository); return loader.loadFiles(catalogSeedFiles.map((file) => resolve(root, file)));
}
if (process.argv[1]?.endsWith("catalog-seed.ts") || process.argv[1]?.endsWith("catalog-seed.js")) console.log(JSON.stringify(await loadDesignCatalog(), null, 2));
