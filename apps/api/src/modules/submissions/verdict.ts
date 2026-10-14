import type { Verdict } from "@codementor/shared";

/**
 * The verdict of a whole submission:
 *  - code that did not compile -> COMPILE_ERROR
 *  - nothing ran at all -> INTERNAL_ERROR (never blame the student for our problem)
 *  - everything accepted -> ACCEPTED
 *  - otherwise the verdict of the FIRST failing test case, as most judges do
 */
export function aggregateVerdict(
  compileOutput: string | null,
  results: { verdict: Verdict }[],
): Verdict {
  if (compileOutput !== null) return "COMPILE_ERROR";
  if (results.length === 0) return "INTERNAL_ERROR";
  return results.find((r) => r.verdict !== "ACCEPTED")?.verdict ?? "ACCEPTED";
}
