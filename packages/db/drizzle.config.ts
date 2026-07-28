import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "";

export default {
  schema: resolve(process.cwd(), "packages/db/src/schema/**/*.ts"),
  out: resolve(process.cwd(), "packages/db/migrations"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
};
