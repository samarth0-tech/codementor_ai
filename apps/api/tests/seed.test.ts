import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@codementor/shared";
import { SEED_PROBLEMS, SEED_TOPICS } from "../src/seed/problems.js";
import { STARTER_CODE } from "../src/seed/starter-code.js";

// These tests need no database: they prove the seed data itself is correct.
describe("seed problems", () => {
  it("has unique, URL-safe slugs and known topics", () => {
    const slugs = SEED_PROBLEMS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const topicSlugs = new Set(SEED_TOPICS.map((t) => t.slug));
    for (const p of SEED_PROBLEMS) {
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      for (const t of p.topics)
        expect(topicSlugs.has(t), `${p.slug}: unknown topic ${t}`).toBe(true);
    }
  });

  it.each(SEED_PROBLEMS.map((p) => [p.slug, p] as const))(
    "%s: every expected output matches the reference solution",
    (_slug, problem) => {
      for (const c of problem.cases) {
        expect(problem.reference(c.input), `input ${JSON.stringify(c.input)}`).toBe(c.expected);
      }
    },
  );

  it.each(SEED_PROBLEMS.map((p) => [p.slug, p] as const))(
    "%s: has at least 2 sample and 3 hidden cases",
    (_slug, problem) => {
      const samples = problem.cases.filter((c) => c.sample).length;
      expect(samples).toBeGreaterThanOrEqual(2);
      expect(problem.cases.length - samples).toBeGreaterThanOrEqual(3);
    },
  );

  it("has starter code for every supported language", () => {
    for (const language of LANGUAGES) expect(STARTER_CODE[language].length).toBeGreaterThan(20);
  });
});
