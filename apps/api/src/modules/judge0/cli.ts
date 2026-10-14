import { loadEnv } from "../../config/env.js";
import { createLogger } from "../../lib/logger.js";
import { createPrisma } from "../../lib/prisma.js";
import { createJudge0Executor } from "./factory.js";
import { formatResolutionTable, runSmokeChecks } from "./verify.js";

// Usage (from the repo root):
//   npm run judge0:check -w @codementor/api                    show the language report
//   npm run judge0:check -w @codementor/api -- --apply         ...and store the verified ids
//   npm run judge0:check -w @codementor/api -- --smoke         ...and run real test programs
//   npm run judge0:check -w @codementor/api -- --apply --smoke
const flags = new Set(process.argv.slice(2));
const env = loadEnv();
// Human-facing tool: show the table and PASS/FAIL lines, not JSON retry logs.
const logger = createLogger("error");
const prisma = createPrisma(env.DATABASE_URL);

try {
  const executor = createJudge0Executor(env, logger, prisma);
  if (!executor) {
    console.error("JUDGE0_API_URL is not set in apps/api/.env, so there is nothing to check.");
    process.exit(2);
  }

  console.log(`Checking Judge0 at ${new URL(env.JUDGE0_API_URL as string).origin} ...\n`);
  const resolutions = await executor.languages.resolutions();
  console.log(formatResolutionTable(resolutions));

  if (flags.has("--apply")) {
    for (const r of resolutions) {
      await prisma.languageConfig.updateMany({
        where: { language: r.language },
        data:
          r.judge0Id === null
            ? { enabled: false }
            : { judge0LanguageId: r.judge0Id, enabled: true },
      });
    }
    executor.languages.invalidate();
    console.log(
      "\nStored the verified ids in the LanguageConfig table (unsupported languages disabled).",
    );
  } else if (resolutions.some((r) => r.source !== "configured")) {
    console.log(
      "\nSome stored ids do not match this instance. The server already uses the verified ids at",
    );
    console.log("runtime; run again with --apply to store them in the database as well.");
  }

  let failed = resolutions.every((r) => r.judge0Id === null);
  if (flags.has("--smoke")) {
    console.log("\nRunning real programs on Judge0 ...\n");
    const results = await runSmokeChecks(executor);
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  [${r.detail}]`);
    failed = failed || results.some((r) => !r.ok);
    console.log(
      failed ? "\nSome checks FAILED." : "\nAll checks passed: real code execution works.",
    );
  } else {
    console.log("\nAdd --smoke to run real test programs in every language.");
  }
  process.exitCode = failed ? 1 : 0;
} catch (err) {
  console.error("Check failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
