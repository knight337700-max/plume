import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RENDERER_VENDOR_DIGEST_MISMATCH = "RENDERER_VENDOR_DIGEST_MISMATCH" as const;

export interface RendererVendorSourceLock {
  readonly repository: "knight337700-max/plume-renderer";
  readonly commit: "7baa272dd852ed21a09cf369c928571b3f75fd31";
  readonly integrationContractVersion: "1.8.0";
  readonly files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
}

export class RendererVendorIntegrityError extends Error {
  public readonly code = RENDERER_VENDOR_DIGEST_MISMATCH;

  public constructor() {
    super(RENDERER_VENDOR_DIGEST_MISMATCH);
    this.name = "RendererVendorIntegrityError";
  }
}

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");
const defaultVendorRoot = path.join(repositoryRoot, "packages", "renderer-vendor");

function normalizedRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

async function listVendoredFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new RendererVendorIntegrityError();
    if (entry.isDirectory()) files.push(...(await listVendoredFiles(root, entryPath)));
    else if (entry.isFile()) files.push(normalizedRelativePath(root, entryPath));
    else throw new RendererVendorIntegrityError();
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

async function fileInventory(root: string): Promise<RendererVendorSourceLock["files"]> {
  const paths = await listVendoredFiles(root);
  return Promise.all(
    paths.map(async (relativePath) => {
      const bytes = await readFile(path.join(root, ...relativePath.split("/")));
      return {
        path: relativePath,
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }),
  );
}

export async function readRendererVendorSourceLock(
  vendorRoot = defaultVendorRoot,
): Promise<RendererVendorSourceLock> {
  return JSON.parse(
    await readFile(path.join(vendorRoot, "SOURCE_LOCK.json"), "utf8"),
  ) as RendererVendorSourceLock;
}

export async function verifyRendererVendorIntegrity(
  options: {
    readonly vendorRoot?: string;
    readonly lock?: RendererVendorSourceLock;
  } = {},
): Promise<void> {
  const vendorRoot = options.vendorRoot ?? defaultVendorRoot;
  const upstreamRoot = path.join(vendorRoot, "upstream");
  const lock = options.lock ?? (await readRendererVendorSourceLock(vendorRoot));
  if (
    lock.repository !== "knight337700-max/plume-renderer" ||
    lock.commit !== "7baa272dd852ed21a09cf369c928571b3f75fd31" ||
    lock.integrationContractVersion !== "1.8.0"
  )
    throw new RendererVendorIntegrityError();

  const actual = await fileInventory(upstreamRoot);
  const expected = [...lock.files].sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (actual.length !== expected.length) throw new RendererVendorIntegrityError();
  for (const [index, file] of actual.entries()) {
    const locked = expected[index];
    if (
      !locked ||
      locked.path !== file.path ||
      locked.bytes !== file.bytes ||
      locked.sha256 !== file.sha256
    )
      throw new RendererVendorIntegrityError();
  }
}

async function main(): Promise<void> {
  await verifyRendererVendorIntegrity();
  process.stdout.write(
    "renderer-vendor PASS: 7baa272dd852ed21a09cf369c928571b3f75fd31 / contract 1.8.0\n",
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === pathToFileURL(fileURLToPath(import.meta.url)).href)
  main().catch(() => {
    process.stderr.write(`${RENDERER_VENDOR_DIGEST_MISMATCH}\n`);
    process.exitCode = 1;
  });
