import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

/**
 * Builds a clean schema in the TEST database before the suite runs, by applying the same SQL
 * migration files that production uses. Skipped when TEST_DATABASE_URL is not set
 * (DB-backed tests then skip themselves; pure unit tests still run).
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("[tests] TEST_DATABASE_URL is not set: database tests will be skipped.");
    return;
  }

  const dbName = new URL(url).pathname.replace("/", "");
  if (!dbName.endsWith("_test")) {
    // This setup DROPS the whole schema. Refuse to run against anything not clearly a test DB.
    throw new Error(`Refusing to reset database "${dbName}": its name must end with "_test".`);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    const migrationsDir = path.resolve(import.meta.dirname, "../prisma/migrations");
    const folders = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const folder of folders) {
      await client.query(readFileSync(path.join(migrationsDir, folder, "migration.sql"), "utf8"));
    }
  } finally {
    await client.end();
  }
}
