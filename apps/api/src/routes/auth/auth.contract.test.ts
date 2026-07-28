import { describe, expect, it } from "vitest";
import { createSessionUseCases, InMemorySessionStore, type SessionRecord } from "../../../../../packages/core/src/modules/iam/session-use-cases.js";

describe("authentication route contract", () => {
  it("does not expose session secrets", async () => {
    const record: SessionRecord = { id: "s1", userId: "u1", email: "u@example.com", displayName: "User", createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000), tokenHash: "secret", passwordHash: "secret" };
    const useCases = createSessionUseCases(new InMemorySessionStore([record]), { listWorkspacesForUser: async () => [] });
    const dto = await useCases.getCurrentSession("s1");
    expect(dto).not.toHaveProperty("tokenHash");
    expect(dto).not.toHaveProperty("passwordHash");
  });
});
