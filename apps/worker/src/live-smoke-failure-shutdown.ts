export interface LiveSmokeFailureShutdownHooks {
  readonly stopWorker: () => Promise<void>;
  readonly exportEvidence: () => Promise<{ readonly status: "COMPLETE" }>;
  readonly stopPostgres: () => Promise<void>;
  readonly preservePostgresVolume: () => Promise<void>;
}

export async function runLiveSmokeFailureShutdown(
  hooks: LiveSmokeFailureShutdownHooks,
): Promise<void> {
  await hooks.stopWorker();
  try {
    const result = await hooks.exportEvidence();
    if (result.status !== "COMPLETE") throw new Error("LIVE_SMOKE_EVIDENCE_EXPORT_INCOMPLETE");
  } catch (error) {
    await hooks.preservePostgresVolume();
    throw error;
  }
  await hooks.preservePostgresVolume();
  await hooks.stopPostgres();
}
