import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { createJacomoFixture } from "../factories/jacomo-factory.js";
import { readJacomoCounts, seedJacomoFixture } from "./jacomo.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL?.trim() ||
  "postgresql://plume:plume_local_only@localhost:5432/plume_test";
const sql = postgres(databaseUrl, { max: 1 });

describe("Jacomo database fixture", () => {
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("seeds deterministic workflow prerequisites and is idempotent", async () => {
    const fixture = createJacomoFixture();
    const first = await seedJacomoFixture(sql, fixture);
    const firstCounts = await readJacomoCounts(sql, fixture);
    const second = await seedJacomoFixture(sql, createJacomoFixture());
    const secondCounts = await readJacomoCounts(sql, fixture);

    expect(second).toEqual(first);
    expect(secondCounts).toEqual(firstCounts);
    expect(fixture.products.map(({ name }) => name)).toEqual(["카르마", "플룸", "엘리쉬"]);
    expect(
      fixture.products.every(({ asset }) =>
        asset.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      ),
    ).toBe(true);
    expect(fixture.catalog.formatProfileId).toBe("00000000-0000-4000-8000-000000000115");

    const [workspace] = await sql<
      { id: string; slug: string }[]
    >`SELECT id, slug FROM workspace WHERE id = ${fixture.workspace.id}`;
    const products = await sql<
      { id: string; name: string }[]
    >`SELECT id, name FROM product WHERE workspace_id = ${fixture.workspace.id} ORDER BY internal_code`;
    const [profile] = await sql<
      {
        status: string;
        verification_status: string;
        spec_json: string;
      }[]
    >`SELECT status, verification_status, spec_json FROM format_profile WHERE id = ${fixture.catalog.formatProfileId}`;
    expect(workspace).toEqual({ id: fixture.workspace.id, slug: "jacomo-test" });
    expect(products.map(({ name }) => name)).toEqual(["카르마", "플룸", "엘리쉬"]);
    expect(profile).toMatchObject({
      status: "ACTIVE",
      verification_status: "VERIFIED",
    });
    expect(JSON.parse(profile?.spec_json ?? "{}")).toMatchObject({ width: 1029, height: 258 });
    expect(firstCounts.product).toBe(3);
    expect(firstCounts.design_asset).toBe(3);
  });
});
