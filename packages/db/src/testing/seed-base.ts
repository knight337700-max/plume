import postgres from "postgres";
import { pathToFileURL } from "node:url";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function assertSeedDatabase(url: string): { url: string } {
  const target = new URL(url);
  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if ((process.env.NODE_ENV ?? "development") === "production") {
    throw new Error("Database seed is disabled in production");
  }
  if (
    !(
      target.hostname === "localhost" ||
      target.hostname === "127.0.0.1" ||
      target.hostname === "::1"
    )
  ) {
    throw new Error("Test seed requires a local database host");
  }
  if (!(database === "plume_test" || database.endsWith("_test"))) {
    throw new Error("Test seed requires a database named plume_test or *_test");
  }
  return { url };
}

/** Inserts stable base data without creating cross-workspace fixtures. */
export async function seedBase(
  url = process.env.TEST_DATABASE_URL?.trim() ||
    "postgresql://plume:plume_local_only@localhost:5432/plume_test",
): Promise<{ workspaceId: string; userId: string }> {
  const target = assertSeedDatabase(url);
  const db = postgres(target.url, { max: 1 });
  try {
    await db`
      INSERT INTO workspace (id, name, slug, status)
      VALUES (${workspaceId}, 'Plume Test Workspace', 'plume-test', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, deleted_at = NULL
    `;
    await db`
      INSERT INTO user_account (id, email, display_name, status)
      VALUES (${userId}, 'seed@plume.local', 'Plume Test User', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, status = EXCLUDED.status, deleted_at = NULL
    `;
  } finally {
    await db.end({ timeout: 5 });
  }
  return { workspaceId, userId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seedBase();
}
