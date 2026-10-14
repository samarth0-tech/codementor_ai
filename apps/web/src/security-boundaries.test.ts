import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards the browser/server boundary. Anything prefixed NEXT_PUBLIC_ is copied into the JavaScript
// that every visitor downloads, so no credential may ever be named that way, and the frontend must
// not know about the code-execution or AI credentials at all (they live only in apps/api).

const root = path.resolve(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === ".next") return [];
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

/** The file's code, without comment lines (comments may legitimately say "never use NEXT_PUBLIC_"). */
const code = (file: string) =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(#|\/\/|\*|\/\*)/.test(line))
    .join("\n");

const sourceFiles = files(path.join(root, "src")).filter(
  (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("security-boundaries.test.ts"),
);
const envExamples = files(root).filter((f) => path.basename(f).startsWith(".env"));

describe("frontend/backend secret boundary", () => {
  it("finds the files it is supposed to check", () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
    expect(envExamples.length).toBeGreaterThan(0);
  });

  it("never exposes a credential-like variable through NEXT_PUBLIC_", () => {
    const sensitive =
      /NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|JUDGE0|ANTHROPIC|DATABASE)/i;
    for (const file of [...sourceFiles, ...envExamples]) {
      expect(code(file), file).not.toMatch(sensitive);
    }
  });

  it("does not use NEXT_PUBLIC_ variables at all (none are needed)", () => {
    for (const file of [...sourceFiles, ...envExamples]) {
      expect(code(file), file).not.toContain("NEXT_PUBLIC_");
    }
  });

  it("keeps Judge0 and Anthropic credentials out of the frontend entirely", () => {
    for (const file of [...sourceFiles, ...envExamples]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /JUDGE0_(API_URL|AUTH_TOKEN|RAPIDAPI_KEY)|ANTHROPIC_API_KEY|X-Auth-Token|x-rapidapi-key/i,
      );
    }
  });

  it("never lets a browser-side file read process.env secrets", () => {
    const clientFiles = sourceFiles.filter((f) =>
      /^\s*["']use client["']/m.test(readFileSync(f, "utf8").slice(0, 200)),
    );
    expect(clientFiles.length).toBeGreaterThan(0);
    for (const file of clientFiles) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /process\.env\.(API_SHARED_SECRET|AUTH_SECRET|[A-Z_]*(KEY|TOKEN|SECRET))/,
      );
    }
  });
});
