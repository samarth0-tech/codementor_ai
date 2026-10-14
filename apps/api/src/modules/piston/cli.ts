import { loadEnv } from "../../config/env.js";
import { createLogger } from "../../lib/logger.js";
import { runSmokeChecks } from "../judge0/verify.js";
import { createPistonExecutor } from "./factory.js";

// Usage (from the repo root):
//   npm run piston:check -w @codementor/api                    check runtimes
//   npm run piston:check -w @codementor/api -- --smoke         ...and run smoke test programs
const flags = new Set(process.argv.slice(2));
const env = loadEnv();
const logger = createLogger("error");

try {
  const executor = createPistonExecutor(env, logger);
  console.log(`Checking Piston at ${env.PISTON_API_URL} ...\n`);

  const supported = await executor.supportedLanguages();
  if (!supported || supported.length === 0) {
    console.log("Could not detect supported languages from Piston endpoint.");
  } else {
    console.log(`Supported languages (${supported.length}): ${supported.join(", ")}\n`);
  }

  if (flags.has("--smoke")) {
    console.log("Running real programs on Piston ...\n");
    const results = await runSmokeChecks(executor);
    for (const r of results) {
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  [${r.detail}]`);
    }
    const failed = results.some((r) => !r.ok);
    console.log(
      failed
        ? "\nSome checks FAILED."
        : "\nAll checks passed: real code execution works on Piston.",
    );
    process.exitCode = failed ? 1 : 0;
  } else {
    console.log("Add --smoke to run real test programs in every language.");
    process.exitCode = 0;
  }
} catch (err) {
  console.error("Check failed:", (err as Error).message);
  process.exitCode = 1;
}
