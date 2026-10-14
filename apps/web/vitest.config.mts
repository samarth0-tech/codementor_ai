import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      API_BASE_URL: "http://api.test:4000",
      // Test-only values, not real secrets.
      API_SHARED_SECRET: "test-only-shared-secret-0123456789-abcdef",
      AUTH_URL: "http://localhost:3000",
    },
  },
});
