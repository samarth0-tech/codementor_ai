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
import { MAX_CAPTURE_CHARS, MAX_COMPILE_CHARS, truncate } from "../judge0/limits.js";
import { LANGUAGE_MAPPINGS, getSupportedLanguages } from "./languages.js";
import type { PistonClient } from "./types.js";

export interface PistonExecutorOptions {
  timeoutMs?: number;
  logger?: Logger;
}

export class PistonExecutor implements CodeExecutor {
  readonly name = "piston";

  constructor(
    private readonly client: PistonClient,
    private readonly options: PistonExecutorOptions = {},
  ) {}

  async supportedLanguages(): Promise<Language[] | null> {
    try {
      const runtimes = await this.client.getRuntimes();
      return getSupportedLanguages(runtimes);
    } catch {
      return null;
    }
  }

  async execute(request: ExecutionRequest): Promise<ExecutionOutcome> {
    if (request.cases.length === 0) return { compileOutput: null, results: [] };

    const mapping = LANGUAGE_MAPPINGS[request.language];
    if (!mapping) {
      throw new ExecutionError(
        "UNSUPPORTED_LANGUAGE",
        `Language ${request.language} is not supported by Piston executor`,
      );
    }

    const fileName = mapping.getFileName(request.sourceCode);
    const pistonLang = mapping.pistonLanguage;

    // Run the first test case first to check for compile errors on compiled languages
    const firstCase = request.cases[0]!;
    const firstResult = await this.client.execute({
      language: pistonLang,
      version: "*",
      files: [{ name: fileName, content: request.sourceCode }],
      stdin: firstCase.input,
      run_timeout: request.timeLimitMs,
      compile_timeout: 10_000,
    });

    if (firstResult.compile && firstResult.compile.code !== 0) {
      const text = firstResult.compile.output || firstResult.compile.stderr || "Compilation failed";
      return { compileOutput: truncate(text, MAX_COMPILE_CHARS), results: [] };
    }

    // If first case compiled, execute remaining test cases concurrently
    const remainingCases = request.cases.slice(1);
    const remainingResults = await Promise.all(
      remainingCases.map((c) =>
        this.client.execute({
          language: pistonLang,
          version: "*",
          files: [{ name: fileName, content: request.sourceCode }],
          stdin: c.input,
          run_timeout: request.timeLimitMs,
          compile_timeout: 10_000,
        }),
      ),
    );

    const allResults = [firstResult, ...remainingResults];

    return {
      compileOutput: null,
      results: allResults.map((r, i): CaseOutcome => {
        const testCase = request.cases[i]!;
        const run = r.run;
        const stdout = truncate(run.stdout ?? "", MAX_CAPTURE_CHARS);
        const stderr = run.stderr ? truncate(run.stderr, MAX_CAPTURE_CHARS) : null;

        const isTimeout =
          run.signal === "SIGKILL" ||
          run.signal === "SIGTERM" ||
          (run.output && /time limit exceeded|timed out/i.test(run.output)) ||
          (run.stderr && /time limit exceeded|timed out/i.test(run.stderr));

        let verdict: Verdict;
        if (isTimeout) {
          verdict = "TIME_LIMIT";
        } else if (run.code !== 0) {
          verdict = "RUNTIME_ERROR";
        } else if (outputsMatch(testCase.expectedOutput, run.stdout ?? "")) {
          verdict = "ACCEPTED";
        } else {
          verdict = "WRONG_ANSWER";
        }

        return {
          testCaseId: testCase.testCaseId,
          verdict,
          stdout: verdict === "TIME_LIMIT" ? null : stdout,
          stderr,
          timeMs: null,
          memoryKb: null,
        };
      }),
    };
  }
}
