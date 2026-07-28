import { describe, expect, it } from "vitest";
import { etagForRevision } from "../../concurrency/etag.js";
import { assertIfMatch } from "../../concurrency/precondition.js";

describe("workspace route contract", () => {
  it("uses revision ETags for mutable resources", () => {
    const etag = etagForRevision(3);
    expect(etag).toBe('W/"revision-3"');
    expect(() => assertIfMatch(etag, 3)).not.toThrow();
    expect(() => assertIfMatch(etag, 4)).toThrow();
  });
});
