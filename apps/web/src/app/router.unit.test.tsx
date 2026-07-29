import { describe, expect, it } from "vitest";
import { apiBaseUrl, routes } from "./router";

describe("application router", () => {
  it("defines a root route with a nested landing page", () => {
    const rootRoute = routes[0];

    expect(rootRoute?.path).toBe("/");
    expect(rootRoute?.children).toHaveLength(1);
    expect(rootRoute?.children?.[0]?.index).toBe(true);
    expect(rootRoute?.errorElement).toBeDefined();
  });

  it("uses the API base URL configured by the runtime", () => {
    expect(apiBaseUrl).toMatch(/^\/(?:api\/v1)?$|^https?:\/\//);
  });
});
