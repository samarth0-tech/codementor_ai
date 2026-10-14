import { describe, expect, it } from "vitest";
import { resolveLanguages } from "../src/modules/judge0/languages.js";
import {
  SMOKE_CHECKS,
  formatResolutionTable,
  runSmokeChecks,
} from "../src/modules/judge0/verify.js";
import {
  ExecutionError,
  type CodeExecutor,
  type ExecutionRequest,
} from "../src/modules/submissions/executor.js";
import { LANGUAGES } from "@codementor/shared";
import { CLASSIC_LANGUAGES, MODERN_LANGUAGES } from "./helpers/fake-judge0.js";

const SEEDED = { C: 50, CPP: 54, JAVA: 62, PYTHON: 71, JAVASCRIPT: 63 };

describe("judge0:check language report", () => {
  it("shows stored vs used ids and what to do about mismatches", () => {
    const table = formatResolutionTable(resolveLanguages(MODERN_LANGUAGES, SEEDED));
    expect(table).toContain("Language");
    expect(table).toMatch(/PYTHON\s+71\s+100\s+Python \(3\.12\.5\)\s+AUTO-DETECTED/);
    const ok = formatResolutionTable(resolveLanguages(CLASSIC_LANGUAGES, SEEDED));
    expect(ok.match(/\bOK\b/g)).toHaveLength(5);
    const none = formatResolutionTable(resolveLanguages([], SEEDED));
    expect(none).toContain("UNSUPPORTED");
    expect(none).toContain("(not available)");
  });
});

describe("judge0:check smoke tests", () => {
  it("cover all five languages plus a compile-error probe and a time-limit probe", () => {
    expect(
      new Set(SMOKE_CHECKS.filter((c) => c.expect === "OUTPUT").map((c) => c.language)),
    ).toEqual(new Set(LANGUAGES));
    expect(SMOKE_CHECKS.some((c) => c.expect === "COMPILE_ERROR")).toBe(true);
    expect(SMOKE_CHECKS.some((c) => c.expect === "TIME_LIMIT")).toBe(true);
  });

  /** An executor that behaves like a correct Judge0 for these programs. */
  const healthy: CodeExecutor = {
    name: "healthy",
    async execute(req: ExecutionRequest) {
      const c = req.cases[0]!;
      if (req.sourceCode.includes("main( {")) return { compileOutput: "error", results: [] };
      const verdict = req.sourceCode.includes("while True") ? "TIME_LIMIT" : "ACCEPTED";
      return {
        compileOutput: null,
        results: [
          {
            testCaseId: c.testCaseId,
            verdict,
            stdout: c.expectedOutput,
            stderr: null,
            timeMs: 12,
            memoryKb: 1,
          },
        ],
      };
    },
  };

  it("passes when real execution behaves correctly", async () => {
    const results = await runSmokeChecks(healthy);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("fails (with the reason) when a language gives wrong output", async () => {
    const broken: CodeExecutor = {
      name: "broken",
      execute: async (req) => {
        const out = await healthy.execute(req);
        if (req.language === "JAVA" && out.results[0])
          out.results[0] = { ...out.results[0], verdict: "WRONG_ANSWER", stdout: "6" };
        return out;
      },
    };
    const results = await runSmokeChecks(broken);
    const java = results.find((r) => r.name.startsWith("Java ("));
    expect(java?.ok).toBe(false);
    expect(java?.detail).toMatch(/WRONG_ANSWER[\s\S]*expected ACCEPTED/);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("fails when a compile error is not reported, or a time limit is not enforced", async () => {
    const lax: CodeExecutor = {
      name: "lax",
      execute: async (req) => ({
        compileOutput: null,
        results: [
          {
            testCaseId: "smoke",
            verdict: "ACCEPTED",
            stdout: req.cases[0]!.expectedOutput,
            stderr: null,
            timeMs: 1,
            memoryKb: 1,
          },
        ],
      }),
    };
    const failed = (await runSmokeChecks(lax)).filter((r) => !r.ok).map((r) => r.name);
    expect(failed).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/compile error/i),
        expect.stringMatching(/time limit/i),
      ]),
    );
  });

  it("reports an execution failure instead of crashing", async () => {
    const down: CodeExecutor = {
      name: "down",
      execute: async () => Promise.reject(new ExecutionError("AUTH", "HTTP 403")),
    };
    const results = await runSmokeChecks(down);
    expect(results.every((r) => !r.ok && r.detail.startsWith("AUTH"))).toBe(true);
  });

  it("flags an unexpected compile error in a program that should work", async () => {
    const ce: CodeExecutor = {
      name: "ce",
      execute: async () => ({ compileOutput: "no javac", results: [] }),
    };
    const results = await runSmokeChecks(
      ce,
      SMOKE_CHECKS.filter((c) => c.language === "JAVA"),
    );
    expect(results[0]).toMatchObject({ ok: false });
    expect(results[0]?.detail).toContain("unexpected compile error");
  });
});
