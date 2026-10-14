import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// Shared ESLint rules for apps/api and packages/shared.
// apps/web has its own eslint.config.mjs (Next.js rules), so it is ignored here.
export default defineConfig([
  globalIgnores(["**/dist/**", "**/node_modules/**", "**/generated/**", "apps/web/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
]);
