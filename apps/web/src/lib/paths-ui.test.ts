import { describe, expect, it } from "vitest";
import { formatEstimate, getStepStyle } from "./paths-ui";

describe("paths-ui helpers", () => {
  describe("getStepStyle", () => {
    it("returns completed style", () => {
      const s = getStepStyle("COMPLETED");
      expect(s.label).toBe("Completed");
      expect(s.icon).toBe("✓");
    });

    it("returns current style", () => {
      const s = getStepStyle("CURRENT");
      expect(s.label).toBe("Start");
      expect(s.icon).toBe("→");
    });

    it("returns locked style", () => {
      const s = getStepStyle("LOCKED");
      expect(s.label).toBe("Locked");
      expect(s.icon).toBe("🔒");
    });
  });

  describe("formatEstimate", () => {
    it("formats minutes under 60", () => {
      expect(formatEstimate(20)).toBe("~20 min");
      expect(formatEstimate(45)).toBe("~45 min");
    });

    it("formats exact hours", () => {
      expect(formatEstimate(60)).toBe("~1h");
      expect(formatEstimate(120)).toBe("~2h");
    });

    it("formats hours and minutes", () => {
      expect(formatEstimate(90)).toBe("~1h 30m");
      expect(formatEstimate(75)).toBe("~1h 15m");
    });
  });
});
