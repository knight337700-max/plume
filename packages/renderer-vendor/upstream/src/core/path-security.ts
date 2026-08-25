import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";

export class PathSecurityError extends Error {
  readonly inputPath: string;

  constructor(message: string, inputPath: string) {
    super(message);
    this.name = "PathSecurityError";
    this.inputPath = inputPath;
  }
}

function isUnc(value: string): boolean {
  return value.startsWith("\\\\") || value.startsWith("//");
}

function isDescendant(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function assertNoReparseInExistingPath(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  const segments = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new PathSecurityError("Symlink or reparse point is prohibited", current);
    } catch (error) {
      if (error instanceof PathSecurityError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") break;
      throw error;
    }
  }
}

export async function resolveTrustedRoot(rootInput: string): Promise<string> {
  if (!path.isAbsolute(rootInput) || isUnc(rootInput)) {
    throw new PathSecurityError("Trusted root must be a non-UNC absolute path", rootInput);
  }
  const rootStat = await lstat(rootInput);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new PathSecurityError("Trusted root must be a real directory", rootInput);
  }
  return realpath(rootInput);
}

export function assertSafeRelativeReference(reference: string): void {
  if (
    reference.length === 0 ||
    reference.includes("\0") ||
    isUnc(reference) ||
    path.isAbsolute(reference) ||
    path.win32.isAbsolute(reference)
  ) {
    throw new PathSecurityError("Path reference must be project-relative", reference);
  }
  const normalized = reference.replaceAll("\\", "/");
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new PathSecurityError("Parent traversal is prohibited", reference);
  }
}

export async function resolveTrustedInputFile(root: string, reference: string): Promise<string> {
  assertSafeRelativeReference(reference);
  const target = path.resolve(root, ...reference.split("/"));
  if (!isDescendant(root, target)) throw new PathSecurityError("Input escapes trusted root", reference);
  await assertNoReparseInExistingPath(root, target);
  let targetStat;
  try {
    targetStat = await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return target;
    throw error;
  }
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
    throw new PathSecurityError("Input must be a regular file", reference);
  }
  return target;
}

export async function resolveTrustedJobDirectory(
  outputRoot: string,
  directory: string,
  baseName: string,
): Promise<string> {
  assertSafeRelativeReference(directory);
  assertSafeRelativeReference(baseName);
  if (baseName === "." || baseName === "..") throw new PathSecurityError("Unsafe baseName", baseName);
  const target = path.resolve(outputRoot, ...directory.split("/"), baseName);
  if (!isDescendant(outputRoot, target)) throw new PathSecurityError("Output escapes trusted root", target);
  await assertNoReparseInExistingPath(outputRoot, target);
  return target;
}

export async function createSafeDirectory(trustedRoot: string, target: string): Promise<void> {
  if (target !== trustedRoot && !isDescendant(trustedRoot, target)) {
    throw new PathSecurityError("Directory escapes trusted root", target);
  }
  await mkdir(target, { recursive: true });
  await assertNoReparseInExistingPath(trustedRoot, target);
}

export function assertSameVolume(left: string, right: string): void {
  if (path.parse(left).root.toLowerCase() !== path.parse(right).root.toLowerCase()) {
    throw new PathSecurityError("Atomic publish requires the same volume", `${left} -> ${right}`);
  }
}
