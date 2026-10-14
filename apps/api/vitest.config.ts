import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    // All DB tests share one test database, so run test files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      BCRYPT_COST: "4",
      // Test-only value, not a real secret. Must be 32+ characters.
      API_SHARED_SECRET: "test-only-shared-secret-0123456789-abcdef",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://unused@localhost:5432/unused_test",
    },
  },
});
