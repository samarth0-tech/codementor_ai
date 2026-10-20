import { describe, expect, it } from "vitest";
import { calculateProgress, formatActivityDate, formatPercent } from "./dashboard-ui";

describe("dashboard-ui helpers", () => {
  it("formats percentages correctly", () => {
    expect(formatPercent(75.4)).toBe("75%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(null)).toBe("0%");
    expect(formatPercent(undefined)).toBe("0%");
  });

  it("calculates progress bar percentages safely", () => {
    expect(calculateProgress(5, 10)).toBe(50);
    expect(calculateProgress(0, 10)).toBe(0);
    expect(calculateProgress(10, 10)).toBe(100);
    expect(calculateProgress(15, 10)).toBe(100);
    expect(calculateProgress(5, 0)).toBe(0);
  });

  it("formats activity dates cleanly", () => {
    const nowIso = new Date().toISOString();
    expect(formatActivityDate(nowIso)).toBe("Just now");

    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(formatActivityDate(tenMinAgo)).toBe("10m ago");

    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    expect(formatActivityDate(twoHoursAgo)).toBe("2h ago");

    expect(formatActivityDate("invalid-date")).toBe("");
  });
});
