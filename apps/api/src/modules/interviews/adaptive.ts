import type { DifficultyAdjustment } from "../ai/prompts/interview.js";

// Pure, deterministic rules for how an interview adapts. The AI never decides the flow of the
// interview: it only writes the questions and rates the answers. These rules decide what happens
// next, so the behaviour is predictable, cheap to test and impossible to talk the AI out of.

export const MAX_FOLLOW_UPS_PER_QUESTION = 2;
/** Below this score the candidate struggled: ask something simpler. */
export const SIMPLER_BELOW = 40;
/** Below this score (but above SIMPLER_BELOW) the answer was partial: probe deeper. */
export const DEEPER_BELOW = 75;

export type NextStep =
  | { action: "FOLLOW_UP"; direction: "SIMPLER" | "DEEPER" }
  | { action: "NEXT_SLOT" }
  | { action: "FINISH" };

export function decideNextStep(input: {
  /** Score (0-100) of the answer that was just evaluated. */
  score: number;
  /** Follow-ups already asked for the current main question. */
  followUpsAsked: number;
  /** Index of the current main question in the plan. */
  slotIndex: number;
  totalSlots: number;
}): NextStep {
  if (input.followUpsAsked < MAX_FOLLOW_UPS_PER_QUESTION) {
    if (input.score < SIMPLER_BELOW) return { action: "FOLLOW_UP", direction: "SIMPLER" };
    if (input.score < DEEPER_BELOW) return { action: "FOLLOW_UP", direction: "DEEPER" };
  }
  return input.slotIndex + 1 < input.totalSlots ? { action: "NEXT_SLOT" } : { action: "FINISH" };
}

/** How hard should the NEXT main question be, judging by the last (up to) two answers? */
export function difficultyAdjustment(recentScores: number[]): DifficultyAdjustment {
  const recent = recentScores.slice(-2);
  if (recent.length === 0) return "same";
  const average = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (average >= 80) return "harder";
  if (average < SIMPLER_BELOW) return "easier";
  return "same";
}
