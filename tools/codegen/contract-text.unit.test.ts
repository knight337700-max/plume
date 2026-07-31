import { describe, expect, it } from "vitest";

import { hashContractText, normalizeContractText } from "./contract-text.ts";

const lfContract = "openapi: 3.0.0\npaths:\n  /health:\n    get:\n      operationId: health\n";
const crlfContract = lfContract.replace(/\n/g, "\r\n");

describe("contract text hashing", () => {
  it("gives LF, CRLF, and BOM-prefixed text the same canonical hash", () => {
    expect(hashContractText(lfContract)).toBe(hashContractText(crlfContract));
    expect(hashContractText(`\uFEFF${crlfContract}`)).toBe(hashContractText(lfContract));
    expect(normalizeContractText(crlfContract)).toBe(lfContract);
  });

  it("preserves semantic drift detection", () => {
    const changedContract = lfContract.replace("operationId: health", "operationId: ready");

    expect(hashContractText(changedContract)).not.toBe(hashContractText(lfContract));
  });

  it("preserves the canonical final newline policy", () => {
    expect(normalizeContractText(lfContract).endsWith("\n")).toBe(true);
    expect(normalizeContractText(lfContract.trimEnd()).endsWith("\n")).toBe(false);
  });
});
