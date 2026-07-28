import { describe, expect, it } from "vitest";
import { createSessionUseCases, InMemorySessionStore, type SessionRecord } from "./session-use-cases.js";
import { createInMemoryIamRepositories } from "./repositories.js";

const record: SessionRecord = {
  id: "s1", userId: "u1", email: "owner@example.com", displayName: "Owner",
  createdAt: new Date("2026-01-01T00:00:00Z"), expiresAt: new Date("2027-01-01T00:00:00Z"),
  tokenHash: "must-not-leak", passwordHash: "must-not-leak",
};

describe("session use cases", () => {
  it("returns a secret-free DTO and makes logout idempotent", async () => {
    const store = new InMemorySessionStore([record]);
    const useCases = createSessionUseCases(store, createInMemoryIamRepositories());
    const session = await useCases.getCurrentSession("s1");
    expect(session).toEqual({ id: "s1", user: { id: "u1", email: "owner@example.com", displayName: "Owner" }, expiresAt: "2027-01-01T00:00:00.000Z" });
    expect(JSON.stringify(session)).not.toContain("must-not-leak");
    await useCases.logout("s1");
    await useCases.logout("s1");
    expect(await useCases.getCurrentSession("s1")).toBeNull();
  });
});
