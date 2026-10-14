import type { Language, Verdict } from "@codementor/shared";
import type { Logger } from "../../lib/logger.js";
import { outputsMatch } from "../submissions/compare.js";
import {
  ExecutionError,
  type CaseOutcome,
  type CodeExecutor,
  type ExecutionOutcome,
  type ExecutionRequest,
} from "../submissions/executor.js";
import type { Judge0LanguageDirectory } from "./languages.js";
import { MAX_CAPTURE_CHARS, MAX_COMPILE_CHARS, toJudge0Limits, truncate } from "./limits.js";
import { interpretStatus } from "./status.js";
import type { Judge0Client, Judge0Result } from "./types.js";

export interface Judge0ExecutorOptions {
  /** Give up waiting for results after this long (milliseconds). */
  pollTimeoutMs: number;
  pollIntervalMs: number;
  /** Test cases sent per request (Judge0's own default maximum is 20). */
  maxBatch: number;
  logger?: Logger;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Runs student code on Judge0 (a sandbox). This is the REAL executor: results come from actually
 * compiling and running the code. It plugs into the pipeline through the CodeExecutor interface.
 *
 * Design notes:
 *  - One Judge0 submission per test case, sent in batches. (Judge0 compiles each separately.)
 *  - We do NOT send expected_output: Judge0 only reports whether the program ran, and OUR compare
 *    function decides right or wrong, so the rules are identical and unit-tested.
 *  - Anything that is not the student's fault (service down, busy, sandbox internal error,
 *    unexpected response) is thrown as an ExecutionError and ends as INTERNAL_ERROR.
 */
export class Judge0Executor implements CodeExecutor {
  readonly name = "judge0";
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly client: Judge0Client,
    readonly languages: Judge0LanguageDirectory,
    private readonly options: Judge0ExecutorOptions,
  ) {
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
  }

  async supportedLanguages(): Promise<Language[] | null> {
    try {
      return await this.languages.supported();
    } catch {
      return null; // cannot tell right now (service unreachable)
    }
  }

  async execute(request: ExecutionRequest): Promise<ExecutionOutcome> {
    if (request.cases.length === 0) return { compileOutput: null, results: [] };

    const languageId = await this.languages.idFor(request.language);
    const limits = toJudge0Limits(request.timeLimitMs, request.memoryLimitKb);

    const results: Judge0Result[] = [];
    for (const group of chunk(request.cases, this.options.maxBatch)) {
      const tokens = await this.client.createBatch(
        group.map((c) => ({
          languageId,
          sourceCode: request.sourceCode,
          stdin: c.input,
          ...limits,
        })),
      );
      results.push(...(await this.waitForAll(tokens)));
    }

    // Sandbox trouble is never the student's fault.
    const broken = results.find((r) => interpretStatus(r.statusId) === "INTERNAL");
    if (broken) {
      this.options.logger?.error(
        {
          statusId: broken.statusId,
          description: broken.statusDescription,
          message: broken.message,
        },
        "Judge0 reported an internal error (on a self-hosted instance this is often the cgroup v1 requirement)",
      );
      throw new ExecutionError("UNAVAILABLE", `Judge0 internal error (status ${broken.statusId})`);
    }

    const compile = results.find((r) => interpretStatus(r.statusId) === "COMPILE_ERROR");
    if (compile) {
      const text = compile.compileOutput ?? compile.message ?? "Compilation failed";
      return { compileOutput: truncate(text, MAX_COMPILE_CHARS), results: [] };
    }

    return {
      compileOutput: null,
      results: results.map((r, i): CaseOutcome => {
        const testCase = request.cases[i] as ExecutionRequest["cases"][number];
        const kind = interpretStatus(r.statusId);
        const base = { testCaseId: testCase.testCaseId, timeMs: r.timeMs, memoryKb: r.memoryKb };
        const stdout = truncate(r.stdout ?? "", MAX_CAPTURE_CHARS);
        const stderr = r.stderr ?? r.message ?? null;
        let verdict: Verdict;
        switch (kind) {
          case "OK":
            verdict = outputsMatch(testCase.expectedOutput, r.stdout ?? "")
              ? "ACCEPTED"
              : "WRONG_ANSWER";
            break;
          case "WRONG_ANSWER":
            verdict = "WRONG_ANSWER";
            break;
          case "TIME_LIMIT":
            verdict = "TIME_LIMIT";
            break;
          default:
            verdict = "RUNTIME_ERROR";
        }
        return {
          ...base,
          verdict,
          stdout: verdict === "TIME_LIMIT" ? null : stdout,
          stderr: stderr === null ? null : truncate(stderr, MAX_CAPTURE_CHARS),
        };
      }),
    };
  }

  /** Polls until every token has left the queue, or gives up after pollTimeoutMs. */
  private async waitForAll(tokens: string[]): Promise<Judge0Result[]> {
    const deadline = this.now() + this.options.pollTimeoutMs;
    let delay = this.options.pollIntervalMs;
    for (;;) {
      const batch = await this.client.getBatch(tokens);
      const byToken = new Map(batch.map((r) => [r.token, r]));
      const ordered = tokens.map((t) => byToken.get(t));
      if (ordered.some((r) => r === undefined)) {
        throw new ExecutionError("MALFORMED", "Judge0 results did not match the submitted tokens");
      }
      const done = ordered as Judge0Result[];
      if (done.every((r) => interpretStatus(r.statusId) !== "PENDING")) return done;

      if (this.now() >= deadline) {
        throw new ExecutionError(
          "TIMEOUT",
          `Judge0 results were not ready after ${this.options.pollTimeoutMs} ms`,
        );
      }
      await this.sleep(delay);
      delay = Math.min(Math.round(delay * 1.5), 1500);
    }
  }
}
