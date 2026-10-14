import { describe, expect, it } from "vitest";
import { interpretStatus } from "../src/modules/judge0/status.js";
import {
  MAX_CPU_MS,
  MAX_MEMORY_KB,
  MAX_WALL_SECONDS,
  MIN_CPU_MS,
  MIN_MEMORY_KB,
  toJudge0Limits,
  truncate,
} from "../src/modules/judge0/limits.js";
import {
  Judge0LanguageDirectory,
  compareVersions,
  parseVersion,
  resolveLanguages,
} from "../src/modules/judge0/languages.js";
import { ExecutionError } from "../src/modules/submissions/executor.js";
import type { Judge0Client } from "../src/modules/judge0/types.js";
import { CLASSIC_LANGUAGES, MODERN_LANGUAGES } from "./helpers/fake-judge0.js";

const SEEDED = { C: 50, CPP: 54, JAVA: 62, PYTHON: 71, JAVASCRIPT: 63 } as const;
const byLang = (r: ReturnType<typeof resolveLanguages>) =>
  Object.fromEntries(r.map((x) => [x.language, x]));

describe("Judge0 status interpretation", () => {
  it.each([
    [1, "PENDING"],
    [2, "PENDING"],
    [3, "OK"],
    [4, "WRONG_ANSWER"],
    [5, "TIME_LIMIT"],
    [6, "COMPILE_ERROR"],
    [7, "RUNTIME_ERROR"],
    [11, "RUNTIME_ERROR"],
    [12, "RUNTIME_ERROR"],
    [13, "INTERNAL"],
    [14, "INTERNAL"],
    [99, "INTERNAL"],
    [0, "INTERNAL"],
  ])("status %i -> %s", (id, kind) => {
    expect(interpretStatus(id)).toBe(kind);
  });
});

describe("execution limits", () => {
  it("converts a problem's limits to Judge0 units", () => {
    expect(toJudge0Limits(2000, 256_000)).toEqual({
      cpuTimeLimit: 2,
      wallTimeLimit: 5,
      memoryLimitKb: 256_000,
    });
  });
  it("clamps absurd values (a mistyped problem can never ask for the moon)", () => {
    const high = toJudge0Limits(10 ** 9, 10 ** 9);
    expect(high.cpuTimeLimit).toBe(MAX_CPU_MS / 1000);
    expect(high.memoryLimitKb).toBe(MAX_MEMORY_KB);
    expect(high.wallTimeLimit).toBeLessThanOrEqual(MAX_WALL_SECONDS);
    const low = toJudge0Limits(-5, 0);
    expect(low.cpuTimeLimit).toBe(MIN_CPU_MS / 1000);
    expect(low.memoryLimitKb).toBe(MIN_MEMORY_KB);
  });
  it("always allows wall time at least as long as CPU time", () => {
    for (const ms of [100, 1000, 5000, 10_000]) {
      const l = toJudge0Limits(ms, 256_000);
      expect(l.wallTimeLimit).toBeGreaterThan(l.cpuTimeLimit);
    }
  });
  it("truncates long output and leaves short output alone", () => {
    expect(truncate("abc", 10)).toBe("abc");
    expect(truncate("x".repeat(50), 10)).toMatch(/^x{10}\n\.\.\.\[output truncated\]$/);
  });
});

describe("version parsing", () => {
  it.each([
    ["C (GCC 9.2.0)", [9, 2, 0]],
    ["Python (3.11.2)", [3, 11, 2]],
    ["Java (OpenJDK 13.0.1)", [13, 0, 1]],
    ["JavaScript (Node.js 18.15.0)", [18, 15, 0]],
    ["Mystery", []],
  ])("%s", (name, version) => expect(parseVersion(name)).toEqual(version));
  it("compares numerically, not as text", () => {
    expect(compareVersions([3, 11, 2], [3, 9, 0])).toBeGreaterThan(0);
    expect(compareVersions([14], [9, 2, 0])).toBeGreaterThan(0);
    expect(compareVersions([3, 8], [3, 8, 0])).toBe(0);
  });
});

describe("resolveLanguages (never assume ids are universal)", () => {
  it("keeps stored ids that are valid for the right kind of language", () => {
    const r = byLang(resolveLanguages(CLASSIC_LANGUAGES, SEEDED));
    expect(Object.values(r).map((x) => x.source)).toEqual([
      "configured",
      "configured",
      "configured",
      "configured",
      "configured",
    ]);
    expect(r["PYTHON"]).toMatchObject({ judge0Id: 71, judge0Name: "Python (3.8.1)" });
  });

  it("detects the right ids on a different instance, newest version first", () => {
    const r = byLang(resolveLanguages(MODERN_LANGUAGES, SEEDED));
    expect(r["C"]).toMatchObject({ judge0Id: 103, source: "auto-detected" });
    expect(r["CPP"]).toMatchObject({ judge0Id: 105, source: "auto-detected" });
    expect(r["JAVA"]).toMatchObject({ judge0Id: 91, source: "auto-detected" });
    expect(r["JAVASCRIPT"]).toMatchObject({ judge0Id: 93, source: "auto-detected" });
    expect(r["PYTHON"]).toMatchObject({ judge0Id: 100, judge0Name: "Python (3.12.5)" });
    expect(r["PYTHON"]?.note).toMatch(/does not exist on this instance/);
  });

  it("catches a stored id that exists but is a DIFFERENT language", () => {
    // 70 is "Python (2.7.17)" here; storing it for JAVA must not be trusted.
    const r = byLang(resolveLanguages(CLASSIC_LANGUAGES, { ...SEEDED, JAVA: 70, PYTHON: 74 }));
    expect(r["JAVA"]).toMatchObject({ judge0Id: 62, source: "auto-detected" });
    expect(r["JAVA"]?.note).toMatch(/Python \(2\.7\.17\)/);
    expect(r["PYTHON"]).toMatchObject({ judge0Id: 71, source: "auto-detected" }); // 74 is TypeScript
  });

  it("never picks Python 2, TypeScript or the Java FX build", () => {
    const tricky = [
      { id: 1, name: "Python (2.7.17)" },
      { id: 2, name: "TypeScript (5.0.0)" },
      { id: 3, name: "Java (OpenJDK 13.0.1 with Java FX)" },
      { id: 4, name: "JavaScript (Node.js 12.14.0)" },
    ];
    const r = byLang(resolveLanguages(tricky, {}));
    expect(r["PYTHON"]?.judge0Id).toBeNull();
    expect(r["JAVA"]?.judge0Id).toBeNull();
    expect(r["JAVASCRIPT"]?.judge0Id).toBe(4);
  });

  it("prefers GCC over Clang, but uses Clang if it is all there is", () => {
    const both = byLang(
      resolveLanguages(
        [
          { id: 1, name: "C (Clang 99.0.0)" },
          { id: 2, name: "C (GCC 7.4.0)" },
        ],
        {},
      ),
    );
    expect(both["C"]?.judge0Id).toBe(2);
    const clangOnly = byLang(resolveLanguages([{ id: 1, name: "C (Clang 7.0.1)" }], {}));
    expect(clangOnly["C"]?.judge0Id).toBe(1);
  });

  it("does not confuse C with C++", () => {
    const r = byLang(resolveLanguages([{ id: 5, name: "C++ (GCC 9.2.0)" }], {}));
    expect(r["C"]?.judge0Id).toBeNull();
    expect(r["CPP"]?.judge0Id).toBe(5);
  });

  it("marks languages the instance lacks as unsupported", () => {
    const r = resolveLanguages([], SEEDED);
    expect(r.every((x) => x.source === "unsupported" && x.judge0Id === null)).toBe(true);
  });
});

describe("Judge0LanguageDirectory", () => {
  function setup(languages = MODERN_LANGUAGES) {
    let calls = 0;
    let fail = false;
    let clock = 0;
    const client = {
      getLanguages: async () => {
        calls++;
        if (fail) throw new ExecutionError("UNAVAILABLE", "down");
        return languages;
      },
    } as unknown as Judge0Client;
    const directory = new Judge0LanguageDirectory({
      client,
      configured: async () => SEEDED,
      ttlMs: 1000,
      now: () => clock,
    });
    return {
      directory,
      calls: () => calls,
      setFail: (v: boolean) => (fail = v),
      advance: (ms: number) => (clock += ms),
    };
  }

  it("resolves ids and lists supported languages", async () => {
    const { directory } = setup();
    expect(await directory.idFor("PYTHON")).toBe(100);
    expect((await directory.supported()).sort()).toEqual([
      "C",
      "CPP",
      "JAVA",
      "JAVASCRIPT",
      "PYTHON",
    ]);
  });

  it("caches within the TTL (one request for many lookups, even concurrent ones)", async () => {
    const { directory, calls } = setup();
    await Promise.all([directory.idFor("C"), directory.idFor("JAVA"), directory.supported()]);
    await directory.idFor("PYTHON");
    expect(calls()).toBe(1);
  });

  it("refreshes after the TTL, and keeps the old answer if the refresh fails", async () => {
    const { directory, calls, advance, setFail } = setup();
    await directory.idFor("C");
    advance(5000);
    setFail(true);
    expect(await directory.idFor("C")).toBe(103); // stale answer beats an outage
    expect(calls()).toBe(2);
  });

  it("throws UNSUPPORTED_LANGUAGE for a language the instance lacks", async () => {
    const { directory } = setup([{ id: 92, name: "Python (3.11.2)" }]);
    await expect(directory.idFor("JAVA")).rejects.toMatchObject({ kind: "UNSUPPORTED_LANGUAGE" });
  });

  it("propagates the failure when there is nothing cached", async () => {
    const { directory, setFail } = setup();
    setFail(true);
    await expect(directory.supported()).rejects.toMatchObject({ kind: "UNAVAILABLE" });
  });
});
