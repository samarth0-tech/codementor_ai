import { describe, expect, it } from "vitest";
import { formatRemaining, scoreTone, secondsSince } from "./interview-ui";

describe("formatRemaining", () => {
  it.each([
    [0, "0:00"],
    [-5000, "0:00"],
    [999, "0:00"],
    [1000, "0:01"],
    [65_000, "1:05"],
    [125_000, "2:05"],
    [3_599_000, "59:59"],
    [3_725_000, "1:02:05"],
  ])("%i ms -> %s", (ms, expected) => {
    expect(formatRemaining(ms)).toBe(expected);
  });
});

describe("scoreTone", () => {
  it("matches the scoring bands", () => {
    expect(scoreTone(90)).toBe("good");
    expect(scoreTone(70)).toBe("good");
    expect(scoreTone(69)).toBe("ok");
    expect(scoreTone(50)).toBe("ok");
    expect(scoreTone(49)).toBe("low");
  });
});

describe("secondsSince", () => {
  const asked = "2026-10-08T10:00:00.000Z";
  it("measures elapsed seconds", () => {
    expect(secondsSince(asked, Date.parse(asked) + 90_000)).toBe(90);
  });
  it("never goes negative or over one day, and survives bad dates", () => {
    expect(secondsSince(asked, Date.parse(asked) - 5000)).toBe(0);
    expect(secondsSince(asked, Date.parse(asked) + 10 * 86_400_000)).toBe(86_400);
    expect(secondsSince("not-a-date", Date.now())).toBe(0);
  });
});
