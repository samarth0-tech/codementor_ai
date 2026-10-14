import type { Language } from "@codementor/shared";
import { ExecutionError, type CodeExecutor } from "../submissions/executor.js";
import type { LanguageResolution } from "./languages.js";

// Helpers behind `npm run judge0:check`: a human-readable language report and a set of smoke tests
// that run REAL programs through the same executor the website uses.

export function formatResolutionTable(resolutions: LanguageResolution[]): string {
  const rows = [
    ["Language", "Stored id", "Id used", "Judge0 name", "Status"],
    ...resolutions.map((r) => [
      r.language,
      r.configuredId === null ? "-" : String(r.configuredId),
      r.judge0Id === null ? "-" : String(r.judge0Id),
      r.judge0Name ?? "(not available)",
      r.source === "configured"
        ? "OK"
        : r.source === "auto-detected"
          ? "AUTO-DETECTED"
          : "UNSUPPORTED",
    ]),
  ];
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((row) => (row[c] as string).length)));
  return rows
    .map((row) => row.map((cell, c) => cell.padEnd(widths[c] as number)).join("  "))
    .join("\n");
}

export interface SmokeCheck {
  name: string;
  language: Language;
  source: string;
  input: string;
  expect: "OUTPUT" | "COMPILE_ERROR" | "TIME_LIMIT";
  /** For OUTPUT checks: the exact expected output. */
  expected?: string;
  timeLimitMs?: number;
}

const SUM_INPUT = "2 3\n";
const SUM_EXPECTED = "5";

export const SMOKE_CHECKS: SmokeCheck[] = [
  {
    name: "Python reads input and prints 5",
    language: "PYTHON",
    source: "a, b = map(int, input().split())\nprint(a + b)\n",
    input: SUM_INPUT,
    expected: SUM_EXPECTED,
    expect: "OUTPUT",
  },
  {
    name: "JavaScript reads input and prints 5",
    language: "JAVASCRIPT",
    source:
      'const [a, b] = require("fs").readFileSync(0, "utf8").split(/\\s+/).map(Number);\nconsole.log(a + b);\n',
    input: SUM_INPUT,
    expected: SUM_EXPECTED,
    expect: "OUTPUT",
  },
  {
    name: "Java (class Main) reads input and prints 5",
    language: "JAVA",
    source:
      "import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner s = new Scanner(System.in);\n    System.out.println(s.nextInt() + s.nextInt());\n  }\n}\n",
    input: SUM_INPUT,
    expected: SUM_EXPECTED,
    expect: "OUTPUT",
  },
  {
    name: "C++ reads input and prints 5",
    language: "CPP",
    source:
      '#include <iostream>\nint main() {\n  long long a, b;\n  std::cin >> a >> b;\n  std::cout << a + b << "\\n";\n  return 0;\n}\n',
    input: SUM_INPUT,
    expected: SUM_EXPECTED,
    expect: "OUTPUT",
  },
  {
    name: "C reads input and prints 5",
    language: "C",
    source:
      '#include <stdio.h>\nint main(void) {\n  long long a, b;\n  scanf("%lld %lld", &a, &b);\n  printf("%lld\\n", a + b);\n  return 0;\n}\n',
    input: SUM_INPUT,
    expected: SUM_EXPECTED,
    expect: "OUTPUT",
  },
  {
    name: "A compile error is reported as a compile error",
    language: "C",
    source: "int main( {\n",
    input: "",
    expect: "COMPILE_ERROR",
  },
  {
    name: "An endless loop is stopped by the time limit",
    language: "PYTHON",
    source: "while True:\n    pass\n",
    input: "",
    expect: "TIME_LIMIT",
    timeLimitMs: 2000,
  },
];

export interface SmokeResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runSmokeChecks(
  executor: CodeExecutor,
  checks: SmokeCheck[] = SMOKE_CHECKS,
): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  for (const check of checks) {
    try {
      const outcome = await executor.execute({
        language: check.language,
        sourceCode: check.source,
        cases: [{ testCaseId: "smoke", input: check.input, expectedOutput: check.expected ?? "" }],
        timeLimitMs: check.timeLimitMs ?? 2000,
        memoryLimitKb: 256_000,
      });
      if (check.expect === "COMPILE_ERROR") {
        const ok = outcome.compileOutput !== null;
        results.push({
          name: check.name,
          ok,
          detail: ok ? "compile error reported" : "expected a compile error",
        });
        continue;
      }
      if (outcome.compileOutput !== null) {
        results.push({
          name: check.name,
          ok: false,
          detail: `unexpected compile error: ${outcome.compileOutput.slice(0, 160)}`,
        });
        continue;
      }
      const verdict = outcome.results[0]?.verdict;
      const want = check.expect === "TIME_LIMIT" ? "TIME_LIMIT" : "ACCEPTED";
      const ms = outcome.results[0]?.timeMs;
      results.push({
        name: check.name,
        ok: verdict === want,
        detail: `${verdict ?? "no result"}${ms != null ? ` (${ms} ms)` : ""}${
          verdict === want
            ? ""
            : ` (expected ${want}; output: ${JSON.stringify(outcome.results[0]?.stdout ?? "")})`
        }`,
      });
    } catch (err) {
      const detail = err instanceof ExecutionError ? `${err.kind}: ${err.message}` : String(err);
      results.push({ name: check.name, ok: false, detail });
    }
  }
  return results;
}
