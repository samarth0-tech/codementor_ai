import { z } from "zod";
import { MIN_SECRET_LENGTH } from "@codementor/shared/assertion";

// Server-only configuration. None of these names start with NEXT_PUBLIC_, so Next.js never
// sends them to the browser.
const schema = z.object({
  API_BASE_URL: z.url("API_BASE_URL must be a full URL, e.g. http://localhost:4000"),
  API_SHARED_SECRET: z
    .string()
    .min(MIN_SECRET_LENGTH, `API_SHARED_SECRET must be at least ${MIN_SECRET_LENGTH} characters`),
  AUTH_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    API_BASE_URL: process.env.API_BASE_URL,
    API_SHARED_SECRET: process.env.API_SHARED_SECRET,
    AUTH_URL: process.env.AUTH_URL || undefined,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid web server environment:\n${problems.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}
