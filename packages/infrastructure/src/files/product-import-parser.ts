import { inflateRawSync } from "node:zlib";

export interface ProductImportRow {
  readonly rowNo: number;
  readonly product: { readonly workspaceId: string; readonly brandId: string; readonly name: string; readonly internalCode?: string; readonly categoryCode?: string; readonly landingUrl?: string; readonly description?: string; readonly sellingPoints: readonly unknown[]; readonly attributes: Readonly<Record<string, unknown>> };
}

export interface ParsedProductRow { readonly rowNo: number; readonly values: Readonly<Record<string, string>> }
export interface ProductImportMapping { readonly workspaceId: string; readonly brandId: string }
export interface ProductImportRowError { readonly rowNo: number; readonly code: string; readonly message: string }

export function parseProductImport(bytes: Uint8Array, filename: string): readonly ParsedProductRow[] {
  return filename.toLowerCase().endsWith(".xlsx") ? parseXlsx(bytes) : parseCsv(new TextDecoder().decode(bytes));
}

export function mapProductRows(rows: readonly ParsedProductRow[], mapping: ProductImportMapping): { readonly rows: readonly ProductImportRow[]; readonly errors: readonly ProductImportRowError[] } {
  const valid: ProductImportRow[] = [];
  const errors: ProductImportRowError[] = [];
  for (const row of rows) {
    const name = row.values.name?.trim();
    if (!name) { errors.push({ rowNo: row.rowNo, code: "PRODUCT_NAME_REQUIRED", message: "Product name is required" }); continue; }
    valid.push({ rowNo: row.rowNo, product: { workspaceId: mapping.workspaceId, brandId: mapping.brandId, name, ...(row.values.internalCode ? { internalCode: row.values.internalCode } : {}), ...(row.values.categoryCode ? { categoryCode: row.values.categoryCode } : {}), ...(row.values.landingUrl ? { landingUrl: row.values.landingUrl } : {}), ...(row.values.description ? { description: row.values.description } : {}), sellingPoints: row.values.sellingPoints ? row.values.sellingPoints.split("|").map((value) => value.trim()).filter(Boolean) : [], attributes: parseAttributes(row.values.attributes) } });
  }
  return { rows: valid, errors };
}

function parseCsv(source: string): readonly ParsedProductRow[] {
  const records = readCsvRecords(source.replace(/^\uFEFF/, ""));
  const headers = (records.shift() ?? []).map((header) => header.trim());
  if (!headers.includes("name")) throw importError("IMPORT_HEADER_REQUIRED", "CSV must include a name column");
  return records.filter((record) => record.some((value) => value.trim() !== "")).map((record, index) => ({ rowNo: index + 2, values: Object.fromEntries(headers.map((header, column) => [header, record[column] ?? ""])) }));
}

function readCsvRecords(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (!quoted && (character === "," || character === "\t")) { row.push(value); value = ""; continue; }
    if (!quoted && (character === "\n" || character === "\r")) { if (character === "\r" && next === "\n") index += 1; row.push(value); rows.push(row); row = []; value = ""; continue; }
    value += character;
  }
  if (value.length > 0 || row.length > 0) { row.push(value); rows.push(row); }
  return rows;
}

function parseXlsx(bytes: Uint8Array): readonly ParsedProductRow[] {
  const entries = readZipEntries(bytes);
  const sharedStrings = entries.get("xl/sharedStrings.xml") ? parseSharedStrings(entries.get("xl/sharedStrings.xml")!) : [];
  const sheet = entries.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw importError("IMPORT_SHEET_REQUIRED", "XLSX must include the first worksheet");
  const rows: string[][] = [];
  for (const rowXml of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of rowXml[1]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cell[1] ?? "";
      const coordinate = attributes.match(/\br="([A-Z]+)\d+"/)?.[1] ?? "A";
      const column = columnNumber(coordinate);
      const value = cell[2]!.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      cells[column] = attributes.includes('t="s"') ? sharedStrings[Number(value)] ?? "" : decodeXml(value);
    }
    rows.push(cells.map((cell) => cell ?? ""));
  }
  const headers = (rows.shift() ?? []).map((header) => header.trim());
  if (!headers.includes("name")) throw importError("IMPORT_HEADER_REQUIRED", "XLSX must include a name column");
  return rows.filter((row) => row.some((value) => value.trim() !== "")).map((row, index) => ({ rowNo: index + 2, values: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""])) }));
}

function readZipEntries(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw importError("XLSX_ZIP_INVALID", "XLSX archive footer is missing");
  const count = buffer.readUInt16LE(end + 10);
  const centralOffset = buffer.readUInt32LE(end + 16);
  const entries = new Map<string, string>();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw importError("XLSX_ZIP_INVALID", "XLSX central directory is invalid");
    const compression = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (["xl/sharedStrings.xml", "xl/worksheets/sheet1.xml"].includes(name)) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(start, start + compressedSize);
      const content = compression === 0 ? compressed : compression === 8 ? inflateRawSync(compressed) : null;
      if (!content) throw importError("XLSX_COMPRESSION_UNSUPPORTED", "XLSX entry compression is unsupported");
      entries.set(name, content.toString("utf8"));
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseSharedStrings(xml: string): string[] { return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => decodeXml([...match[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join(""))); }
function columnNumber(value: string): number { return [...value].reduce((result, character) => result * 26 + character.charCodeAt(0) - 64, 0) - 1; }
function decodeXml(value: string): string { return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'"); }
function parseAttributes(value?: string): Readonly<Record<string, unknown>> { if (!value) return {}; try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function importError(code: string, message: string): Error { const error = new Error(message); Object.assign(error, { code, statusCode: 422 }); return error; }
