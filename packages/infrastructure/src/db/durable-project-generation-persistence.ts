import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Sql } from "postgres";
import type { CreativeGeneratePayload } from "../../../contracts/src/async.js";

const jsonbBytes = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");

/** Persists Project generation context from the durable command payload before worker execution. */
export class DurableProjectGenerationPersistence {
  constructor(private readonly sql: Sql) {}

  async persist(input: {
    workspaceId: string;
    jobId: string;
    payload: CreativeGeneratePayload;
  }): Promise<{ generationRequestId: string; creativeSetId: string } | null> {
    if (!input.payload.projectId || !input.payload.assetPoolSnapshot) return null;
    const projectId = input.payload.projectId;
    const assetPoolSnapshot = input.payload.assetPoolSnapshot;
    const briefVersionId = input.payload.briefVersionId ?? "";
    return this.sql.begin(async (sql) => {
      await sql`SELECT id FROM async_job WHERE id = ${input.jobId} AND workspace_id = ${input.workspaceId} FOR UPDATE`;
      const existing = await sql<{ id: string; creative_set_id: string | null }[]>`
        SELECT id, creative_set_id FROM generation_request
        WHERE workspace_id = ${input.workspaceId} AND async_job_id = ${input.jobId} FOR UPDATE`;
      if (existing[0]?.creative_set_id)
        return { generationRequestId: existing[0].id, creativeSetId: existing[0].creative_set_id };

      const generationRequestId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) {
        const rows = await sql<{ id: string }[]>`
        INSERT INTO generation_request
          (id, workspace_id, campaign_id, project_id, brief_version_id, async_job_id,
           generation_mode, config_json, asset_pool_snapshot_json, status)
        VALUES (${generationRequestId}, ${input.workspaceId}, ${input.payload.campaignId},
          ${projectId}, ${briefVersionId}, ${input.jobId},
          ${input.payload.generationMode ?? "MOCK_AI"},
          convert_from(${jsonbBytes({ productIds: input.payload.productIds, formatProfileIds: input.payload.formatProfileIds, variantCountPerProduct: input.payload.variantCountPerProduct })}, 'UTF8')::jsonb,
          convert_from(${jsonbBytes(assetPoolSnapshot)}, 'UTF8')::jsonb, 'QUEUED')
        RETURNING id`;
        if (!rows[0]) throw new Error("PROJECT_GENERATION_REQUEST_PERSIST_FAILED");
      }
      const creativeSetId = randomUUID();
      const sets = await sql<{ id: string }[]>`
      INSERT INTO creative_set
        (id, workspace_id, campaign_id, project_id, generation_request_id, name, status)
      VALUES (${creativeSetId}, ${input.workspaceId}, ${input.payload.campaignId},
        ${projectId}, ${generationRequestId}, ${`Generation ${input.jobId}`}, 'GENERATING')
      RETURNING id`;
      if (!sets[0]) throw new Error("PROJECT_CREATIVE_SET_PERSIST_FAILED");
      await sql`UPDATE generation_request SET creative_set_id = ${creativeSetId} WHERE id = ${generationRequestId} AND workspace_id = ${input.workspaceId}`;
      return { generationRequestId, creativeSetId: sets[0].id };
    });
  }
}
