import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env files by itself, so load apps/api/.env here. Variables that are
// already set in the real environment (CI, production) always win over the file.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file: rely on real environment variables
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
