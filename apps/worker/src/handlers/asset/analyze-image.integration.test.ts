import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createImageAnalysisHandler, createInMemoryImageAnalysisStore } from "./analyze-image.js";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

describe("image analysis worker", () => {
  it("stores metadata against the exact asset version and isolates unsupported items", async () => {
    const store = createInMemoryImageAnalysisStore();
    const handler = createImageAnalysisHandler({ source: { async read() { return png; } }, store });
    const completed = await handler({ workspaceId: "ws-1", assetVersionId: "version-1", objectKey: "uploads/one", mimeType: "image/png" });
    const failed = await createImageAnalysisHandler({ source: { async read() { return new TextEncoder().encode("not an image"); } }, store })({ workspaceId: "ws-1", assetVersionId: "version-2", objectKey: "uploads/two", mimeType: "image/png" });

    expect(completed).toMatchObject({ assetVersionId: "version-1", status: "COMPLETED", analysis: { width: 1, height: 1 } });
    expect(store.values.has("version-1")).toBe(true);
    expect(failed).toMatchObject({ assetVersionId: "version-2", status: "FAILED", error: { code: "UNSUPPORTED_IMAGE" } });
    expect(createHash("sha256").update(png).digest("hex")).toHaveLength(64);
  });
});
