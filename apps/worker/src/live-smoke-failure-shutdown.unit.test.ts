import { describe, expect, it } from "vitest";
import { runLiveSmokeFailureShutdown } from "./live-smoke-failure-shutdown.js";

describe("live smoke failure shutdown ordering", () => {
  it("stops the Worker, exports, preserves the volume, then stops Postgres", async () => {
    const events: string[] = [];
    await runLiveSmokeFailureShutdown({
      stopWorker: async () => void events.push("worker-stopped"),
      exportEvidence: async () => {
        events.push("exported");
        return { status: "COMPLETE" };
      },
      preservePostgresVolume: async () => void events.push("volume-preserved"),
      stopPostgres: async () => void events.push("postgres-stopped"),
    });
    expect(events).toEqual(["worker-stopped", "exported", "volume-preserved", "postgres-stopped"]);
  });

  it("preserves Postgres and does not stop it when export fails", async () => {
    const events: string[] = [];
    await expect(
      runLiveSmokeFailureShutdown({
        stopWorker: async () => void events.push("worker-stopped"),
        exportEvidence: async () => {
          events.push("export-failed");
          throw new Error("EXPORT_FAILED");
        },
        preservePostgresVolume: async () => void events.push("volume-preserved"),
        stopPostgres: async () => void events.push("postgres-stopped"),
      }),
    ).rejects.toThrow("EXPORT_FAILED");
    expect(events).toEqual(["worker-stopped", "export-failed", "volume-preserved"]);
  });
});
