import type { Sql } from "postgres";

export interface DurableFormatBinding {
  readonly canonicalFormatKey: string;
  readonly campaignFormatSelectionId: string;
  readonly formatProfileId: string;
}

function formatBindingError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code, statusCode: 409 });
}

/**
 * Resolves existing public format-selection references into internal durable
 * bindings. It deliberately does not create rows: GenerationRequestItem is
 * worker-owned and is persisted with the Project command transaction.
 */
export class DrizzleProjectFormatBindingResolver {
  constructor(private readonly sql: Sql) {}

  async resolve(
    workspaceId: string,
    campaignId: string,
    formatSelectionIds: readonly string[],
  ): Promise<readonly DurableFormatBinding[]> {
    if (new Set(formatSelectionIds).size !== formatSelectionIds.length)
      throw formatBindingError(
        "PROJECT_FORMAT_SELECTION_AMBIGUOUS",
        "A Project generation format selection may be supplied only once",
      );
    const result: DurableFormatBinding[] = [];
    for (const selectionId of formatSelectionIds) {
      const rows = await this.sql<
        {
          campaign_format_selection_id: string;
          format_profile_id: string;
          canonical_format_key: string;
        }[]
      >`SELECT cfs.id AS campaign_format_selection_id, fp.id AS format_profile_id,
          fp.stable_key AS canonical_format_key
        FROM campaign_format_selection cfs
        JOIN format_profile fp ON fp.id = cfs.format_profile_id
        WHERE cfs.workspace_id = ${workspaceId}
          AND cfs.campaign_id = ${campaignId}
          AND cfs.id = ${selectionId}
          AND cfs.status = 'SELECTED'`;
      if (rows.length === 0)
        throw formatBindingError(
          "PROJECT_FORMAT_SELECTION_REQUIRED",
          "Project generation requires an active Campaign Format Selection",
        );
      if (rows.length !== 1)
        throw formatBindingError(
          "PROJECT_FORMAT_SELECTION_AMBIGUOUS",
          "Project generation format selection is ambiguous",
        );
      const row = rows[0]!;
      result.push({
        canonicalFormatKey: row.canonical_format_key,
        campaignFormatSelectionId: row.campaign_format_selection_id,
        formatProfileId: row.format_profile_id,
      });
    }
    return Object.freeze(result);
  }
}
