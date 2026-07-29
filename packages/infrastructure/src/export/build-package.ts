import { createHash } from "node:crypto";
import { createExportPackagePlan, type ExportPackagePlan, type ExportRecipePlanInput } from "@plume/core/src/public.js";
import { buildExportManifest, sha256, stableJson, type ExportManifest, type ExportManifestFile } from "./manifest.js";

export type PackageFileRole = "CREATIVE" | "MANIFEST" | "VALIDATION_REPORT" | "COPY_CSV" | "PACKAGE";

export interface ExportPackageItemInput {
  readonly creativeVersionId: string;
  readonly bytes: Uint8Array;
  readonly relativePath: string;
  readonly mimeType?: string;
  readonly validationReportCsv?: string;
  readonly copyCsv?: string;
  readonly manifest?: Readonly<Record<string, unknown>>;
}

export interface BuildExportPackageInput {
  readonly exportJobId: string;
  readonly workspaceId?: string;
  readonly campaignId?: string;
  readonly requestedBy?: string;
  readonly exportedAt?: string;
  readonly recipe: ExportRecipePlanInput & Readonly<Record<string, unknown>>;
  readonly items: readonly ExportPackageItemInput[];
  readonly manifest?: Omit<Partial<ExportManifest>, "files" | "schemaVersion">;
}

export interface BuiltPackageFile extends ExportManifestFile {
  readonly role: PackageFileRole;
  readonly bytesValue: Uint8Array;
}

export interface BuildExportPackageResult {
  readonly exportJobId: string;
  readonly status: "COMPLETED";
  readonly package: BuiltPackageFile;
  readonly files: readonly ExportManifestFile[];
  readonly manifest: ExportManifest;
  readonly zipBytes: Uint8Array;
  readonly checksumSha256: string;
  readonly warnings: readonly string[];
  readonly plan: ExportPackagePlan;
}

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function sanitizeFilename(value: string, maxLength = 120): string {
  const withoutControls = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[<>:"|?*]/g, "_");
  const normalized = withoutControls.trim().replace(/[. ]+$/g, "");
  const safe = normalized.replace(/[\\/]+/g, "_") || "file";
  const reservedSafe = WINDOWS_RESERVED_NAMES.test(safe) ? `_${safe}` : safe;
  return reservedSafe.slice(0, Math.max(1, maxLength)).replace(/[. ]+$/g, "") || "file";
}

export function sanitizeRelativePath(value: string, maxSegmentLength = 120): string {
  const segments = value.replaceAll("\\", "/").split("/").filter((segment) => segment !== "" && segment !== "." && segment !== "..");
  const safe = segments.map((segment) => sanitizeFilename(segment, maxSegmentLength));
  return (safe.length > 0 ? safe : ["file"]).join("/");
}

function collisionSafePath(value: string, used: Set<string>): string {
  const normalized = sanitizeRelativePath(value);
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }
  const slash = normalized.lastIndexOf("/");
  const directory = slash < 0 ? "" : normalized.slice(0, slash + 1);
  const filename = slash < 0 ? normalized : normalized.slice(slash + 1);
  const extensionIndex = filename.lastIndexOf(".");
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
  let suffix = 2;
  let candidate = `${directory}${stem}-${suffix}${extension}`;
  while (used.has(candidate)) candidate = `${directory}${stem}-${++suffix}${extension}`;
  used.add(candidate);
  return candidate;
}

function deterministicFileId(relativePath: string, checksumSha256: string): string {
  const digest = createHash("sha256").update(`${relativePath}\0${checksumSha256}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function asBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
}

function manifestFile(input: { readonly relativePath: string; readonly role: PackageFileRole; readonly bytes: Uint8Array }): BuiltPackageFile {
  const checksumSha256 = sha256(input.bytes);
  return {
    fileId: deterministicFileId(input.relativePath, checksumSha256),
    relativePath: input.relativePath,
    role: input.role,
    bytes: input.bytes.byteLength,
    checksumSha256,
    bytesValue: input.bytes,
  };
}

function csvReport(items: readonly BuiltPackageFile[]): string {
  const header = "file_name,channel,product,placement,format_profile,validation_result,bytes,checksum_sha256";
  const rows = items.filter((item) => item.role === "CREATIVE").map((item) => `${csvCell(item.relativePath)},,,,,PASS,${item.bytes},${item.checksumSha256}`);
  return `${[header, ...rows].join("\n")}\n`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

interface ZipCentralEntry { readonly name: Uint8Array; readonly bytes: Uint8Array; readonly crc: number; readonly offset: number }

/** Creates a deterministic UTF-8 ZIP using stored entries and a fixed DOS timestamp. */
export function createDeterministicZip(files: readonly Pick<BuiltPackageFile, "relativePath" | "bytesValue">[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centralEntries: ZipCentralEntry[] = [];
  let offset = 0;
  for (const file of [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    const name = new TextEncoder().encode(file.relativePath);
    const bytes = new Uint8Array(file.bytesValue);
    const crc = crc32(bytes);
    const local = concat([Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(bytes.byteLength), u32(bytes.byteLength), u16(name.byteLength), u16(0), name, bytes]);
    locals.push(local);
    centralEntries.push({ name, bytes, crc, offset });
    offset += local.byteLength;
  }
  const centralOffset = offset;
  const central = centralEntries.map((entry) => concat([Uint8Array.from([0x50, 0x4b, 0x01, 0x02]), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(entry.crc), u32(entry.bytes.byteLength), u32(entry.bytes.byteLength), u16(entry.name.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(entry.offset), entry.name]));
  const centralBytes = concat(central);
  const end = concat([Uint8Array.from([0x50, 0x4b, 0x05, 0x06]), u16(0), u16(0), u16(centralEntries.length), u16(centralEntries.length), u32(centralBytes.byteLength), u32(centralOffset), u16(0)]);
  return concat([...locals, centralBytes, end]);
}

export function buildExportPackage(input: BuildExportPackageInput): BuildExportPackageResult {
  const plan = createExportPackagePlan({ recipe: input.recipe, itemCount: input.items.length });
  const used = new Set<string>();
  const creativeFiles = input.items.map((item) => manifestFile({ relativePath: collisionSafePath(item.relativePath, used), role: "CREATIVE", bytes: asBytes(item.bytes) }));
  const files: BuiltPackageFile[] = [...creativeFiles];
  if (plan.includeCopyCsv) {
    const copy = input.items.map((item) => item.copyCsv).filter((value): value is string => value !== undefined).join("\n");
    files.push(manifestFile({ relativePath: collisionSafePath("copy.csv", used), role: "COPY_CSV", bytes: asBytes(copy ? `${copy}\n` : "copy_key,copy_value\n") }));
  }
  if (plan.includeValidationReport) files.push(manifestFile({ relativePath: collisionSafePath("validation-report.csv", used), role: "VALIDATION_REPORT", bytes: asBytes(csvReport(creativeFiles)) }));

  const manifestFiles = files.map(({ bytesValue: _bytesValue, ...file }) => file);
  const workspaceField = input.workspaceId !== undefined
    ? { workspaceId: input.workspaceId }
    : input.manifest?.workspaceId !== undefined
      ? { workspaceId: input.manifest.workspaceId }
      : {};
  const campaignField = input.campaignId !== undefined
    ? { campaignId: input.campaignId }
    : input.manifest?.campaignId !== undefined
      ? { campaignId: input.manifest.campaignId }
      : {};
  const manifest = buildExportManifest({
    ...(input.manifest ?? {}),
    ...workspaceField,
    ...campaignField,
    exportRecipe: input.manifest?.exportRecipe ?? { id: plan.recipeId, packageType: plan.packageType },
    exportJobId: input.exportJobId,
    ...(input.requestedBy === undefined ? {} : { requestedBy: input.requestedBy }),
    exportedAt: input.exportedAt ?? "1970-01-01T00:00:00.000Z",
    files: manifestFiles,
  });
  const manifestBytes = asBytes(`${stableJson(manifest)}\n`);
  if (plan.includeManifest) files.push(manifestFile({ relativePath: collisionSafePath("manifest.json", used), role: "MANIFEST", bytes: manifestBytes }));
  const zipBytes = createDeterministicZip(files);
  if (plan.maxPackageBytes !== null && zipBytes.byteLength > plan.maxPackageBytes) throw new Error(`Export package exceeds recipe limit of ${plan.maxPackageBytes} bytes`);
  const packageFile = manifestFile({ relativePath: `${input.exportJobId}.zip`, role: "PACKAGE", bytes: zipBytes });
  const resultFiles = [...files, packageFile].map(({ bytesValue: _bytesValue, ...file }) => file);
  return { exportJobId: input.exportJobId, status: "COMPLETED", package: packageFile, files: Object.freeze(resultFiles), manifest, zipBytes, checksumSha256: packageFile.checksumSha256, warnings: [], plan };
}

export const buildPackage = buildExportPackage;
