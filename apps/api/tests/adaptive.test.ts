import { describe, expect, it } from "vitest";
import {
  MAX_FOLLOW_UPS_PER_QUESTION,
  decideNextStep,
  difficultyAdjustment,
} from "../src/modules/interviews/adaptive.js";

const base = { followUpsAsked: 0, slotIndex: 0, totalSlots: 3 };

describe("decideNextStep (deterministic interview flow)", () => {
  it("asks a SIMPLER follow-up when the candidate struggled (<40)", () => {
    expect(decideNextStep({ ...base, score: 22 })).toEqual({
      action: "FOLLOW_UP",
      direction: "SIMPLER",
    });
    expect(decideNextStep({ ...base, score: 39 })).toEqual({
      action: "FOLLOW_UP",
      direction: "SIMPLER",
    });
  });

  it("asks a DEEPER follow-up for partial answers (40-74)", () => {
    expect(decideNextStep({ ...base, score: 40 })).toEqual({
      action: "FOLLOW_UP",
      direction: "DEEPER",
    });
    expect(decideNextStep({ ...base, score: 74 })).toEqual({
      action: "FOLLOW_UP",
      direction: "DEEPER",
    });
  });

  it("moves on after a good answer (>=75)", () => {
    expect(decideNextStep({ ...base, score: 75 })).toEqual({ action: "NEXT_SLOT" });
    expect(decideNextStep({ ...base, score: 100 })).toEqual({ action: "NEXT_SLOT" });
  });

  it(`never asks more than ${MAX_FOLLOW_UPS_PER_QUESTION} follow-ups per question`, () => {
    const step = decideNextStep({
      ...base,
      score: 10,
      followUpsAsked: MAX_FOLLOW_UPS_PER_QUESTION,
    });
    expect(step).toEqual({ action: "NEXT_SLOT" });
  });

  it("finishes after the last planned question", () => {
    expect(decideNextStep({ ...base, score: 90, slotIndex: 2 })).toEqual({ action: "FINISH" });
    expect(decideNextStep({ ...base, score: 10, slotIndex: 2, followUpsAsked: 2 })).toEqual({
      action: "FINISH",
    });
  });

  it("always terminates: a candidate who scores 0 forever still ends the interview", () => {
    let slot = 0;
    let followUps = 0;
    let steps = 0;
    for (;;) {
      const step = decideNextStep({
        score: 0,
        followUpsAsked: followUps,
        slotIndex: slot,
        totalSlots: 5,
      });
      steps++;
      if (step.action === "FINISH") break;
      if (step.action === "FOLLOW_UP") followUps++;
      else {
        slot++;
        followUps = 0;
      }
      expect(steps).toBeLessThan(100);
    }
    expect(steps).toBe(5 * (MAX_FOLLOW_UPS_PER_QUESTION + 1));
  });
});

describe("difficultyAdjustment", () => {
  it("is 'same' with no history", () => expect(difficultyAdjustment([])).toBe("same"));
  it("goes harder after strong recent answers", () => {
    expect(difficultyAdjustment([85])).toBe("harder");
    expect(difficultyAdjustment([30, 80, 90])).toBe("harder");
  });
  it("goes easier after weak recent answers", () => {
    expect(difficultyAdjustment([22, 22])).toBe("easier");
  });
  it("stays the same for middling answers", () => {
    expect(difficultyAdjustment([57])).toBe("same");
  });
  it("only looks at the last two scores", () => {
    expect(difficultyAdjustment([5, 5, 5, 90, 90])).toBe("harder");
  });
});
