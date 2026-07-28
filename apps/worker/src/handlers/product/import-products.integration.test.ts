import { describe, expect, it } from "vitest";
import { createProductUseCases } from "../../../../../packages/core/src/modules/client-brand/product-use-cases.js";
import { createInMemoryClientBrandRepositories } from "../../../../../packages/core/src/modules/client-brand/repositories.js";
import { createProductImportWorker } from "./import-products.js";

describe("product import worker", () => {
  it("keeps valid rows when a mixed import contains invalid rows", async () => {
    const products = createProductUseCases(createInMemoryClientBrandRepositories({ advertisers: [{ id: "adv-1", workspaceId: "ws-1", name: "Advertiser", normalizedName: "advertiser", status: "ACTIVE", revisionNo: 1 }], brands: [{ id: "brand-1", workspaceId: "ws-1", advertiserId: "adv-1", name: "Brand", normalizedName: "brand", status: "ACTIVE", revisionNo: 1 }] }));
    const worker = createProductImportWorker({ products, batchSize: 1 });
    const result = await worker({ workspaceId: "ws-1", brandId: "brand-1", filename: "products.csv", bytes: new TextEncoder().encode("name,internalCode,sellingPoints\nValid,V-1,fast|safe\n,INVALID,missing name\nSecond,V-2,clear") });
    expect(result).toMatchObject({ totalRows: 3, succeeded: 2, failed: 1 });
    expect(result.errors[0]).toMatchObject({ rowNo: 3, code: "PRODUCT_NAME_REQUIRED" });
    expect((await products.list("ws-1", "brand-1")).map((product) => product.name)).toEqual(["Valid", "Second"]);
  });
});
