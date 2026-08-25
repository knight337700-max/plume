import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createKakaoBizboardRenderer,
  getRendererRuntimeRoot,
  type FreeformRenderRequest,
  type FreeformRenderResult,
} from "@plume/renderer-vendor";

export interface CanonicalFreeformRendererBridgeOptions {
  readonly rendererRuntimeRoot?: string;
  readonly onEphemeralWorkspaceCreated?: (workspacePath: string) => void;
}

export type CanonicalFreeformRendererBridge = (
  request: FreeformRenderRequest,
) => Promise<FreeformRenderResult>;

/**
 * Runs the pinned FREEFORM renderer in an isolated ephemeral workspace.
 * Assets are passed as bytes; no renderer source or caller filesystem path is
 * exposed to the frozen runtime.
 */
export function createCanonicalFreeformRendererBridge(
  options: CanonicalFreeformRendererBridgeOptions = {},
): CanonicalFreeformRendererBridge {
  return async (request) => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "plume-canonical-freeform-"));
    try {
      options.onEphemeralWorkspaceCreated?.(workspaceRoot);
      const inputRoot = path.join(workspaceRoot, "input");
      const outputRoot = path.join(workspaceRoot, "output");
      await Promise.all([mkdir(inputRoot), mkdir(outputRoot)]);
      const renderer = await createKakaoBizboardRenderer({
        projectRoot: options.rendererRuntimeRoot ?? getRendererRuntimeRoot(),
        inputRoot,
        outputRoot,
      });
      return await renderer.renderFreeform({
        ...request,
        layoutMode: "FREEFORM",
        output: {
          mimeType: "image/png",
          format: "PNG",
          directory: "integration-output",
          baseName: "output",
          overwrite: false,
        },
      });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  };
}
