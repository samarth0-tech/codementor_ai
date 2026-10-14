import { describe, expect, it } from "vitest";
import { PistonExecutor } from "../src/modules/piston/executor.js";
import { getJavaFileName, getSupportedLanguages } from "../src/modules/piston/languages.js";
import type {
  PistonClient,
  PistonExecuteInput,
  PistonExecuteResult,
  PistonRuntime,
} from "../src/modules/piston/types.js";
import type { ExecutionRequest } from "../src/modules/submissions/executor.js";

const sampleRuntimes: PistonRuntime[] = [
  { language: "python", version: "3.10.0", aliases: ["py", "python3"] },
  { language: "javascript", version: "18.15.0", aliases: ["js", "node"] },
  { language: "java", version: "15.0.2", aliases: [] },
  { language: "c++", version: "10.2.0", aliases: ["cpp", "g++"] },
  { language: "c", version: "10.2.0", aliases: ["gcc"] },
  { language: "ruby", version: "3.0.1", aliases: [] },
];

class MockPistonClient implements PistonClient {
  runtimes: PistonRuntime[] = sampleRuntimes;
  runtimesError: Error | null = null;
  executedInputs: PistonExecuteInput[] = [];

  constructor(
    private readonly plan: (input: PistonExecuteInput, index: number) => PistonExecuteResult,
  ) {}

  async getRuntimes(): Promise<PistonRuntime[]> {
    if (this.runtimesError) throw this.runtimesError;
    return this.runtimes;
  }

  async execute(input: PistonExecuteInput): Promise<PistonExecuteResult> {
    this.executedInputs.push(input);
    return this.plan(input, this.executedInputs.length - 1);
  }
}

describe("Piston languages helper", () => {
  it("detects Java public class name or defaults to Main.java", () => {
    expect(
      getJavaFileName("public class Solution { public static void main(String[] args) {} }"),
    ).toBe("Solution.java");
    expect(getJavaFileName("class Main { public static void main(String[] args) {} }")).toBe(
      "Main.java",
    );
    expect(getJavaFileName("")).toBe("Main.java");
  });

  it("filters supported languages correctly from runtime list", () => {
    const supported = getSupportedLanguages(sampleRuntimes);
    expect(supported).toEqual(["PYTHON", "JAVASCRIPT", "JAVA", "CPP", "C"]);

    const pythonOnly = getSupportedLanguages([
      { language: "python", version: "3.10.0", aliases: ["py"] },
    ]);
    expect(pythonOnly).toEqual(["PYTHON"]);
  });
});

describe("PistonExecutor", () => {
  it("returns supported languages from runtimes endpoint", () => {
    const client = new MockPistonClient(() => ({
      language: "python",
      version: "3.10.0",
      run: { stdout: "", stderr: "", output: "", code: 0, signal: null },
    }));
    const executor = new PistonExecutor(client);
    return expect(executor.supportedLanguages()).resolves.toEqual([
      "PYTHON",
      "JAVASCRIPT",
      "JAVA",
      "CPP",
      "C",
    ]);
  });

  it("returns null if runtimes fetch fails", async () => {
    const client = new MockPistonClient(() => ({
      language: "python",
      version: "3.10.0",
      run: { stdout: "", stderr: "", output: "", code: 0, signal: null },
    }));
    client.runtimesError = new Error("Network error");
    const executor = new PistonExecutor(client);
    expect(await executor.supportedLanguages()).toBeNull();
  });

  it("handles empty test cases cleanly", async () => {
    const client = new MockPistonClient(() => ({
      language: "python",
      version: "3.10.0",
      run: { stdout: "", stderr: "", output: "", code: 0, signal: null },
    }));
    const executor = new PistonExecutor(client);
    const outcome = await executor.execute({
      language: "PYTHON",
      sourceCode: "print(1)",
      cases: [],
      timeLimitMs: 1000,
      memoryLimitKb: 64_000,
    });
    expect(outcome).toEqual({ compileOutput: null, results: [] });
    expect(client.executedInputs).toHaveLength(0);
  });

  it("reports ACCEPTED when stdout matches expectedOutput", async () => {
    const client = new MockPistonClient((input) => ({
      language: "python",
      version: "3.10.0",
      run: { stdout: `${input.stdin?.trim()}\n`, stderr: "", output: "", code: 0, signal: null },
    }));
    const executor = new PistonExecutor(client);
    const request: ExecutionRequest = {
      language: "PYTHON",
      sourceCode: "print(input())",
      cases: [
        { testCaseId: "1", input: "hello", expectedOutput: "hello" },
        { testCaseId: "2", input: "world", expectedOutput: "world" },
      ],
      timeLimitMs: 2000,
      memoryLimitKb: 64_000,
    };
    const outcome = await executor.execute(request);
    expect(outcome.compileOutput).toBeNull();
    expect(outcome.results).toHaveLength(2);
    expect(outcome.results[0]?.verdict).toBe("ACCEPTED");
    expect(outcome.results[1]?.verdict).toBe("ACCEPTED");
  });

  it("reports WRONG_ANSWER when stdout differs", async () => {
    const client = new MockPistonClient(() => ({
      language: "python",
      version: "3.10.0",
      run: { stdout: "42\n", stderr: "", output: "42\n", code: 0, signal: null },
    }));
    const executor = new PistonExecutor(client);
    const outcome = await executor.execute({
      language: "PYTHON",
      sourceCode: "print(42)",
      cases: [{ testCaseId: "1", input: "2 2", expectedOutput: "4" }],
      timeLimitMs: 2000,
      memoryLimitKb: 64_000,
    });
    expect(outcome.results[0]?.verdict).toBe("WRONG_ANSWER");
    expect(outcome.results[0]?.stdout).toBe("42\n");
  });

  it("reports RUNTIME_ERROR when exit code is non-zero", async () => {
    const client = new MockPistonClient(() => ({
      language: "python",
      version: "3.10.0",
      run: {
        stdout: "",
        stderr: "ZeroDivisionError: division by zero",
        output: "ZeroDivisionError: division by zero",
        code: 1,
        signal: null,
      },
    }));
    const executor = new PistonExecutor(client);
    const outcome = await executor.execute({
      language: "PYTHON",
      sourceCode: "print(1/0)",
      cases: [{ testCaseId: "1", input: "", expectedOutput: "42" }],
      timeLimitMs: 2000,
      memoryLimitKb: 64_000,
    });
    expect(outcome.results[0]?.verdict).toBe("RUNTIME_ERROR");
    expect(outcome.results[0]?.stderr).toContain("ZeroDivisionError");
  });

  it("reports TIME_LIMIT when process is terminated by signal or timeout output", async () => {
    const client = new MockPistonClient(() => ({
      language: "python",
      version: "3.10.0",
      run: {
        stdout: "",
        stderr: "timed out after 2000ms",
        output: "timed out after 2000ms",
        code: null,
        signal: "SIGKILL",
      },
    }));
    const executor = new PistonExecutor(client);
    const outcome = await executor.execute({
      language: "PYTHON",
      sourceCode: "while True: pass",
      cases: [{ testCaseId: "1", input: "", expectedOutput: "42" }],
      timeLimitMs: 2000,
      memoryLimitKb: 64_000,
    });
    expect(outcome.results[0]?.verdict).toBe("TIME_LIMIT");
    expect(outcome.results[0]?.stdout).toBeNull();
  });

  it("reports compile error and skips remaining cases", async () => {
    const client = new MockPistonClient(() => ({
      language: "c++",
      version: "10.2.0",
      compile: {
        stdout: "",
        stderr: "main.cpp:1:1: error: expected unqualified-id",
        output: "main.cpp:1:1: error: expected unqualified-id",
        code: 1,
        signal: null,
      },
      run: { stdout: "", stderr: "", output: "", code: null, signal: null },
    }));
    const executor = new PistonExecutor(client);
    const outcome = await executor.execute({
      language: "CPP",
      sourceCode: "int main( {",
      cases: [
        { testCaseId: "1", input: "1", expectedOutput: "1" },
        { testCaseId: "2", input: "2", expectedOutput: "2" },
      ],
      timeLimitMs: 2000,
      memoryLimitKb: 64_000,
    });
    expect(outcome.compileOutput).toContain("error: expected unqualified-id");
    expect(outcome.results).toEqual([]);
    expect(client.executedInputs).toHaveLength(1); // Didn't execute the 2nd case
  });

  it("sets the correct filename for Java public class", async () => {
    const client = new MockPistonClient((input) => {
      expect(input.files[0]?.name).toBe("Solution.java");
      return {
        language: "java",
        version: "15.0.2",
        run: { stdout: "hello", stderr: "", output: "hello", code: 0, signal: null },
      };
    });
    const executor = new PistonExecutor(client);
    await executor.execute({
      language: "JAVA",
      sourceCode: "public class Solution { public static void main(String[] args) {} }",
      cases: [{ testCaseId: "1", input: "", expectedOutput: "hello" }],
      timeLimitMs: 2000,
      memoryLimitKb: 64_000,
    });
  });
});
