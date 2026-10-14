import type { CodeExecutor, ExecutionOutcome, ExecutionRequest } from "./executor.js";

/**
 * A SIMULATION, not a real run. It never executes anything. It exists so the editor UI and the
 * whole submission pipeline can be built and tested before Judge0 (Phase 9).
 *
 * Rules (deterministic):
 *  - code containing a marker simulates that failure: __COMPILE_ERROR__, __RUNTIME_ERROR__,
 *    __TIMEOUT__ or __WRONG_ANSWER__
 *  - otherwise, code that is empty or identical to the problem's starter template (ignoring
 *    whitespace) "fails" with a wrong answer, and any real edit "passes" every test.
 */
export const MOCK_MARKERS = {
  compileError: "__COMPILE_ERROR__",
  runtimeError: "__RUNTIME_ERROR__",
  timeout: "__TIMEOUT__",
  wrongAnswer: "__WRONG_ANSWER__",
} as const;

export const MOCK_MIN_MEANINGFUL_CHARS = 20;

const squash = (text: string) => text.replace(/\s+/g, "");

export class MockExecutor implements CodeExecutor {
  readonly name = "mock";

  async execute(request: ExecutionRequest): Promise<ExecutionOutcome> {
    const code = request.sourceCode;
    if (code.includes(MOCK_MARKERS.compileError)) {
      return { compileOutput: "mock executor: simulated compilation error", results: [] };
    }

    const runtimeError = code.includes(MOCK_MARKERS.runtimeError);
    const timeout = code.includes(MOCK_MARKERS.timeout);
    const unchangedStarter =
      request.starterCode != null && squash(code) === squash(request.starterCode);
    const meaningful = squash(code).length >= MOCK_MIN_MEANINGFUL_CHARS && !unchangedStarter;
    const passes = meaningful && !code.includes(MOCK_MARKERS.wrongAnswer);

    return {
      compileOutput: null,
      results: request.cases.map((c, i) => {
        const base = { testCaseId: c.testCaseId, timeMs: 12 + i * 3, memoryKb: 3000 + i * 16 };
        if (runtimeError) {
          return {
            ...base,
            verdict: "RUNTIME_ERROR" as const,
            stdout: "",
            stderr: "mock executor: simulated runtime error",
          };
        }
        if (timeout) {
          return {
            ...base,
            verdict: "TIME_LIMIT" as const,
            stdout: null,
            stderr: null,
            timeMs: request.timeLimitMs,
          };
        }
        return passes
          ? { ...base, verdict: "ACCEPTED" as const, stdout: c.expectedOutput, stderr: null }
          : { ...base, verdict: "WRONG_ANSWER" as const, stdout: "", stderr: null };
      }),
    };
  }
}

/** The same simulation under the name used in the docs. Never a substitute for real execution. */
export const FakeCodeExecutor = MockExecutor;
export type FakeCodeExecutor = MockExecutor;
