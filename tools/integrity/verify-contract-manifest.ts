import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hashContractText } from "../codegen/contract-text.ts";

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const manifestPath = join(repositoryRoot, "contracts-source", "manifest.yaml");
const manifest = readFileSync(manifestPath, "utf8");

const copiedContracts = [
  {
    id: "openapi",
    upstreamPath: "10_api/openapi-v1.yaml",
    sourcePath: "contracts-source/openapi-v1.yaml",
    version: "1.0.0",
  },
  {
    id: "screen-data",
    upstreamPath: "06_product-design/screen-data-contracts.yaml",
    sourcePath: "contracts-source/screen-data-contracts.yaml",
    version: "1.0.0",
  },
  {
    id: "ui-component-catalog",
    upstreamPath: "11_ui-ux/component-catalog.yaml",
    sourcePath: "contracts-source/ui-component-catalog.yaml",
    version: "1.0.0",
  },
];

function sha256(relativePath) {
  const contents = readFileSync(join(repositoryRoot, relativePath), "utf8");
  return hashContractText(contents);
}

function manifestEntry(id) {
  const entry = manifest.match(new RegExp(`- id: ${id}[\\s\\S]*?(?=\\n  - id:|$)`));
  if (!entry) {
    throw new Error(`Manifest entry is missing: ${id}`);
  }
  return entry[0];
}

for (const contract of copiedContracts) {
  const entry = manifestEntry(contract.id);
  const expectedHash = sha256(contract.sourcePath);
  const declaredHash = entry.match(/sha256: ['"]([A-F0-9]{64})['"]/i)?.[1]?.toUpperCase();
  if (declaredHash !== expectedHash) {
    throw new Error(
      `${contract.id} hash mismatch: expected ${expectedHash}, found ${declaredHash ?? "missing"}`,
    );
  }
  for (const expected of [contract.upstreamPath, contract.sourcePath, contract.version]) {
    if (!entry.includes(expected)) {
      throw new Error(`${contract.id} manifest field is missing: ${expected}`);
    }
  }
}

const agentEntry = manifestEntry("agent-schemas");
if (
  !agentEntry.includes("09_agent-engine/schema-registry.yaml") ||
  !agentEntry.includes("hash_scope: upstream_registry")
) {
  throw new Error("Agent schema registry manifest entry is incomplete");
}
if (!existsSync(join(repositoryRoot, "contracts-source", "agent-schemas"))) {
  throw new Error("Agent schema source directory is missing");
}

console.log(`Contract manifest verified: ${copiedContracts.length + 1} entries`);
