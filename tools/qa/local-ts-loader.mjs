import { access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier.startsWith(".") &&
    specifier.endsWith(".js") &&
    context.parentURL?.startsWith("file:")
  ) {
    const candidate = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    try {
      await access(fileURLToPath(candidate));
      return { url: pathToFileURL(fileURLToPath(candidate)).href, shortCircuit: true };
    } catch {
      // The JavaScript target may be a real dependency or a generated file; defer to Node.
    }
  }
  return nextResolve(specifier, context);
}
