import { describe, expect, it } from "vitest";
import { Judge0Executor, type Judge0ExecutorOptions } from "../src/modules/judge0/executor.js";
import { Judge0LanguageDirectory } from "../src/modules/judge0/languages.js";
import { MAX_CAPTURE_CHARS } from "../src/modules/judge0/limits.js";
import type {
  Judge0Client,
  Judge0Result,
  Judge0SubmissionInput,
} from "../src/modules/judge0/types.js";
import { ExecutionError, type ExecutionRequest } from "../src/modules/submissions/executor.js";
import { CLASSIC_LANGUAGES } from "./helpers/fake-judge0.js";

const SEEDED = { C: 50, CPP: 54, JAVA: 62, PYTHON: 71, JAVASCRIPT: 63 };

const done = (over: Partial<Judge0Result> = {}): Judge0Result => ({
  token: "",
  statusId: 3,
  statusDescription: "Accepted",
  stdout: "",
  stderr: null,
  compileOutput: null,
  message: null,
  timeMs: 10,
  memoryKb: 3000,
  ...over,
});

/** A scripted stand-in for Judge0: `plan` decides what each submission "does". */
class ScriptedClient implements Judge0Client {
  languages = CLASSIC_LANGUAGES;
  languageFailure: Error | null = null;
  created: Judge0SubmissionInput[][] = [];
  polls = 0;
  /** Number of polls that still answer "processing" before the real result. */
  pending = 0;
  private readonly inputs = new Map<string, Judge0SubmissionInput>();
  constructor(
    private readonly plan: (
      input: Judge0SubmissionInput,
      index: number,
    ) => Partial<Judge0Result> = () => ({}),
  ) {}

  async getLanguages() {
    if (this.languageFailure) throw this.languageFailure;
    return this.languages;
  }
  async createBatch(inputs: Judge0SubmissionInput[]) {
    this.created.push(inputs);
    return inputs.map((input) => {
      const token = `tok-${this.inputs.size}`;
      this.inputs.set(token, input);
      return token;
    });
  }
  async getBatch(tokens: string[]) {
    this.polls++;
    return tokens.map((token, i) => {
      if (this.polls <= this.pending)
        return done({ token, statusId: this.polls === 1 ? 1 : 2, stdout: null });
      return done({ token, ...this.plan(this.inputs.get(token) as Judge0SubmissionInput, i) });
    });
  }
}

function build(client: ScriptedClient, options: Partial<Judge0ExecutorOptions> = {}) {
  let clock = 0;
  const sleeps: number[] = [];
  const directory = new Judge0LanguageDirectory({ client, configured: async () => SEEDED });
  const executor = new Judge0Executor(client, directory, {
    pollTimeoutMs: 1000,
    pollIntervalMs: 100,
    maxBatch: 20,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...options,
  });
  return { executor, sleeps };
}

const request = (
  cases: { input: string; expectedOutput: string }[],
  over: Partial<ExecutionRequest> = {},
): ExecutionRequest => ({
  language: "PYTHON",
  sourceCode: "print(1)",
  cases: cases.map((c, i) => ({ testCaseId: `case-${i}`, ...c })),
  timeLimitMs: 2000,
  memoryLimitKb: 256_000,
  ...over,
});
const one = [{ input: "2 3\n", expectedOutput: "5" }];

describe("Judge0Executor: verdicts", () => {
  it("accepts matching output, tolerating trailing whitespace and CRLF", async () => {
    const { executor } = build(new ScriptedClient(() => ({ stdout: "5  \r\n\r\n" })));
    const out = await executor.execute(request(one));
    expect(out.compileOutput).toBeNull();
    expect(out.results).toEqual([
      {
        testCaseId: "case-0",
        verdict: "ACCEPTED",
        stdout: "5  \r\n\r\n",
        stderr: null,
        timeMs: 10,
        memoryKb: 3000,
      },
    ]);
  });

  it("decides right/wrong itself: different output is WRONG_ANSWER even when Judge0 says 'Accepted'", async () => {
    const { executor } = build(new ScriptedClient(() => ({ stdout: "6\n" })));
    expect((await executor.execute(request(one))).results[0]?.verdict).toBe("WRONG_ANSWER");
  });

  it("treats no output as wrong, or as right when empty output is expected", async () => {
    const { executor } = build(new ScriptedClient(() => ({ stdout: null })));
    expect((await executor.execute(request(one))).results[0]?.verdict).toBe("WRONG_ANSWER");
    expect(
      (await executor.execute(request([{ input: "", expectedOutput: "" }]))).results[0]?.verdict,
    ).toBe("ACCEPTED");
  });

  it("maps a time limit (status 5) with no output kept", async () => {
    const { executor } = build(
      new ScriptedClient(() => ({ statusId: 5, stdout: "partial", timeMs: 2000 })),
    );
    expect((await executor.execute(request(one))).results[0]).toMatchObject({
      verdict: "TIME_LIMIT",
      stdout: null,
      timeMs: 2000,
    });
  });

  it.each([7, 8, 9, 10, 11, 12])(
    "maps runtime error status %i, keeping stderr",
    async (statusId) => {
      const { executor } = build(
        new ScriptedClient(() => ({ statusId, stderr: "Traceback: boom" })),
      );
      expect((await executor.execute(request(one))).results[0]).toMatchObject({
        verdict: "RUNTIME_ERROR",
        stderr: "Traceback: boom",
      });
    },
  );

  it("falls back to Judge0's message when a runtime error has no stderr", async () => {
    const { executor } = build(
      new ScriptedClient(() => ({
        statusId: 11,
        stderr: null,
        message: "Exited with error status 1",
      })),
    );
    expect((await executor.execute(request(one))).results[0]?.stderr).toBe(
      "Exited with error status 1",
    );
  });

  it("reports a compile error with the compiler output and no test results", async () => {
    const { executor } = build(
      new ScriptedClient(() => ({ statusId: 6, compileOutput: "main.c:1: error: bad" })),
    );
    expect(await executor.execute(request([...one, ...one]))).toEqual({
      compileOutput: "main.c:1: error: bad",
      results: [],
    });
  });

  it("finds a compile error even if it shows up only in a later batch", async () => {
    const { executor } = build(
      new ScriptedClient((input) =>
        input.stdin === "bad" ? { statusId: 6, compileOutput: "late error" } : { stdout: "5" },
      ),
      { maxBatch: 2 },
    );
    const cases = [one[0]!, one[0]!, { input: "bad", expectedOutput: "x" }];
    expect((await executor.execute(request(cases))).compileOutput).toBe("late error");
  });

  it.each([13, 14, 99])(
    "never blames the student for sandbox status %i: throws UNAVAILABLE",
    async (statusId) => {
      const { executor } = build(
        new ScriptedClient(() => ({
          statusId,
          message: "No such file or directory @ rb_sysopen - /box/script.py",
        })),
      );
      await expect(executor.execute(request(one))).rejects.toMatchObject({ kind: "UNAVAILABLE" });
    },
  );

  it("truncates huge output", async () => {
    const { executor } = build(new ScriptedClient(() => ({ stdout: "x".repeat(50_000) })));
    const stdout = (await executor.execute(request(one))).results[0]?.stdout ?? "";
    expect(stdout.length).toBeLessThan(MAX_CAPTURE_CHARS + 50);
    expect(stdout).toContain("[output truncated]");
  });

  it("returns nothing (and calls nothing) for a request with no test cases", async () => {
    const client = new ScriptedClient();
    const { executor } = build(client);
    expect(await executor.execute(request([]))).toEqual({ compileOutput: null, results: [] });
    expect(client.created).toHaveLength(0);
  });
});

describe("Judge0Executor: what is sent", () => {
  it("sends each test case's input as stdin, the verified language id and the problem's limits", async () => {
    const client = new ScriptedClient(() => ({ stdout: "5" }));
    const { executor } = build(client);
    await executor.execute(
      request([...one, { input: "9 9\n", expectedOutput: "18" }], {
        timeLimitMs: 3000,
        memoryLimitKb: 128_000,
      }),
    );
    expect(client.created).toHaveLength(1);
    expect(client.created[0]).toEqual([
      {
        languageId: 71,
        sourceCode: "print(1)",
        stdin: "2 3\n",
        cpuTimeLimit: 3,
        wallTimeLimit: 7,
        memoryLimitKb: 128_000,
      },
      {
        languageId: 71,
        sourceCode: "print(1)",
        stdin: "9 9\n",
        cpuTimeLimit: 3,
        wallTimeLimit: 7,
        memoryLimitKb: 128_000,
      },
    ]);
  });

  it("never sends the expected output to Judge0", async () => {
    const client = new ScriptedClient(() => ({ stdout: "5" }));
    const { executor } = build(client);
    await executor.execute(request([{ input: "1\n", expectedOutput: "SECRET-EXPECTED-ANSWER" }]));
    expect(JSON.stringify(client.created)).not.toContain("SECRET-EXPECTED-ANSWER");
  });

  it("splits large submissions into batches of at most maxBatch and keeps results in order", async () => {
    const client = new ScriptedClient((input) => ({ stdout: input.stdin.trim() }));
    const { executor } = build(client, { maxBatch: 20 });
    const cases = Array.from({ length: 45 }, (_, i) => ({
      input: `n${i}\n`,
      expectedOutput: `n${i}`,
    }));
    const out = await executor.execute(request(cases));
    expect(client.created.map((b) => b.length)).toEqual([20, 20, 5]);
    expect(out.results).toHaveLength(45);
    expect(
      out.results.every((r, i) => r.testCaseId === `case-${i}` && r.verdict === "ACCEPTED"),
    ).toBe(true);
  });
});

describe("Judge0Executor: languages", () => {
  it("throws UNSUPPORTED_LANGUAGE when the instance cannot run the language", async () => {
    const client = new ScriptedClient();
    client.languages = [{ id: 71, name: "Python (3.8.1)" }];
    const { executor } = build(client);
    await expect(executor.execute(request(one, { language: "JAVA" }))).rejects.toMatchObject({
      kind: "UNSUPPORTED_LANGUAGE",
    });
    expect(await executor.supportedLanguages()).toEqual(["PYTHON"]);
  });

  it("reports supported languages as unknown (null) when the service cannot be reached", async () => {
    const client = new ScriptedClient();
    client.languageFailure = new ExecutionError("UNAVAILABLE", "down");
    const { executor } = build(client);
    expect(await executor.supportedLanguages()).toBeNull();
  });
});

describe("Judge0Executor: polling", () => {
  it("waits for queued/processing submissions, polling with a growing, capped delay", async () => {
    const client = new ScriptedClient(() => ({ stdout: "5" }));
    client.pending = 4;
    const { executor, sleeps } = build(client, { pollTimeoutMs: 60_000 });
    expect((await executor.execute(request(one))).results[0]?.verdict).toBe("ACCEPTED");
    expect(client.polls).toBe(5);
    expect(sleeps).toEqual([100, 150, 225, 338]);
  });

  it("gives up with TIMEOUT when results never become ready", async () => {
    const client = new ScriptedClient();
    client.pending = Number.POSITIVE_INFINITY;
    const { executor } = build(client, { pollTimeoutMs: 500 });
    await expect(executor.execute(request(one))).rejects.toMatchObject({ kind: "TIMEOUT" });
  });

  it("treats results that do not match the submitted tokens as MALFORMED", async () => {
    const client = new ScriptedClient();
    client.getBatch = async () => [done({ token: "someone-else" })];
    const { executor } = build(client);
    await expect(executor.execute(request(one))).rejects.toMatchObject({ kind: "MALFORMED" });
  });
});
