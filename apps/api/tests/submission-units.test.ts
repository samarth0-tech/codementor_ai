import { describe, expect, it } from "vitest";
import { MAX_SOURCE_BYTES, createSubmissionSchema, isTerminalStatus } from "@codementor/shared";
import { STARTER_CODE } from "../src/seed/starter-code.js";
import { normalizeOutput, outputsMatch } from "../src/modules/submissions/compare.js";
import { MOCK_MARKERS, MockExecutor } from "../src/modules/submissions/mock-executor.js";
import { aggregateVerdict } from "../src/modules/submissions/verdict.js";

describe("output comparison", () => {
  it("ignores line-ending style, trailing spaces and trailing blank lines", () => {
    expect(outputsMatch("1 2\n3\n", "1 2  \r\n3\r\n\r\n")).toBe(true);
    expect(outputsMatch("YES", "YES\n")).toBe(true);
  });
  it("is strict about everything visible", () => {
    expect(outputsMatch("YES", "yes")).toBe(false);
    expect(outputsMatch("1 2", "1  2")).toBe(false);
    expect(outputsMatch("a\nb", "a\n\nb")).toBe(false);
    expect(outputsMatch("0", "")).toBe(false);
  });
  it("keeps leading whitespace", () => {
    expect(normalizeOutput("  x\n")).toBe("  x");
  });
});

describe("aggregateVerdict", () => {
  const r = (verdict: string) => ({ verdict }) as { verdict: never };
  it("compile output wins", () => expect(aggregateVerdict("error", [])).toBe("COMPILE_ERROR"));
  it("nothing ran is OUR error, not the student's", () =>
    expect(aggregateVerdict(null, [])).toBe("INTERNAL_ERROR"));
  it("all accepted", () =>
    expect(aggregateVerdict(null, [r("ACCEPTED"), r("ACCEPTED")])).toBe("ACCEPTED"));
  it("uses the first failing case", () => {
    expect(aggregateVerdict(null, [r("ACCEPTED"), r("TIME_LIMIT"), r("WRONG_ANSWER")])).toBe(
      "TIME_LIMIT",
    );
  });
});

describe("MockExecutor (a simulation, never runs code)", () => {
  const cases = [
    { testCaseId: "a", input: "1", expectedOutput: "one" },
    { testCaseId: "b", input: "2", expectedOutput: "two" },
  ];
  const run = (sourceCode: string, language: "PYTHON" | "JAVA" | "CPP" = "PYTHON") =>
    new MockExecutor().execute({
      language,
      sourceCode,
      cases,
      timeLimitMs: 2000,
      memoryLimitKb: 256_000,
      starterCode: STARTER_CODE[language],
    });
  const real =
    "def solve(values):\n    total = 0\n    for value in values:\n        total += value * 2\n    return total\n";

  it("is named 'mock' so every stored result is traceable", () => {
    expect(new MockExecutor().name).toBe("mock");
  });
  it.each(["PYTHON", "JAVA", "CPP"] as const)(
    "fails the untouched %s starter template",
    async (language) => {
      const out = await run(STARTER_CODE[language], language);
      expect(out.results.map((x) => x.verdict)).toEqual(["WRONG_ANSWER", "WRONG_ANSWER"]);
    },
  );
  it("ignores whitespace-only changes to the starter, but not real edits", async () => {
    const reformatted = STARTER_CODE.PYTHON.replace(/\n/g, "\n\n") + "   \n";
    expect((await run(reformatted)).results[0]?.verdict).toBe("WRONG_ANSWER");
    expect((await run(STARTER_CODE.PYTHON + "print(1 + 1, 'done')\n")).results[0]?.verdict).toBe(
      "ACCEPTED",
    );
  });
  it("fails empty or near-empty code", async () => {
    expect((await run("pass")).results[0]?.verdict).toBe("WRONG_ANSWER");
  });
  it("passes meaningful code and echoes the expected output", async () => {
    const out = await run(real);
    expect(out.results.map((x) => [x.verdict, x.stdout])).toEqual([
      ["ACCEPTED", "one"],
      ["ACCEPTED", "two"],
    ]);
  });
  it.each([
    [MOCK_MARKERS.runtimeError, "RUNTIME_ERROR"],
    [MOCK_MARKERS.timeout, "TIME_LIMIT"],
    [MOCK_MARKERS.wrongAnswer, "WRONG_ANSWER"],
  ])("simulates %s", async (marker, verdict) => {
    const out = await run(`${real}# ${marker}`);
    expect(out.results.every((x) => x.verdict === verdict)).toBe(true);
  });
  it("simulates a compile error with no per-case results", async () => {
    const out = await run(`${real}# ${MOCK_MARKERS.compileError}`);
    expect(out.compileOutput).toMatch(/compilation error/);
    expect(out.results).toEqual([]);
  });
});

describe("createSubmissionSchema", () => {
  const ok = { problem: "two-sum", language: "PYTHON", sourceCode: "print(1)", mode: "RUN" };
  it("accepts a valid submission and keeps whitespace untouched", () => {
    const code = "  def f():\n    return 1\n";
    expect(createSubmissionSchema.parse({ ...ok, sourceCode: code }).sourceCode).toBe(code);
  });
  it.each([
    ["blank code", { sourceCode: "  \n\t " }],
    ["unknown language", { language: "RUST" }],
    ["unknown mode", { mode: "DEBUG" }],
    ["bad slug", { problem: "Two Sum!" }],
    ["code over the byte limit", { sourceCode: "x".repeat(MAX_SOURCE_BYTES + 1) }],
    ["multi-byte code over the byte limit", { sourceCode: "é".repeat(MAX_SOURCE_BYTES / 2 + 1) }],
  ])("rejects %s", (_n, override) => {
    expect(createSubmissionSchema.safeParse({ ...ok, ...override }).success).toBe(false);
  });
  it("knows which statuses are final", () => {
    expect(isTerminalStatus("COMPLETED")).toBe(true);
    expect(isTerminalStatus("FAILED")).toBe(true);
    expect(isTerminalStatus("QUEUED")).toBe(false);
    expect(isTerminalStatus("RUNNING")).toBe(false);
  });
});
