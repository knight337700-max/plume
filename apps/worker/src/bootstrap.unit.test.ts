import { describe, expect, it } from "vitest";
import { createWorkerBootstrap } from "./bootstrap.js";

function fakeAdapter() {
  return {
    consume() {
      return { close: async () => undefined };
    },
    close: async () => undefined,
  } as never;
}

describe("worker bootstrap readiness", () => {
  it("does not report ready without runtime handlers", async () => {
    const bootstrap = createWorkerBootstrap({ adapter: fakeAdapter() });
    await expect(bootstrap.start()).resolves.toMatchObject({ status: "not-ready", activeHandlers: 0 });
  });

  it("reports ready only when required message types are registered", async () => {
    const bootstrap = createWorkerBootstrap({
      adapter: fakeAdapter(),
      requiredHandlerTypes: ["job.retry"],
      handlers: [{ queue: "default", messageTypes: ["job.retry"], handler: async () => undefined }],
    });
    await expect(bootstrap.start()).resolves.toMatchObject({ status: "ready", activeHandlers: 1 });
    await expect(bootstrap.stop()).resolves.toMatchObject({ status: "stopped" });
  });
});
