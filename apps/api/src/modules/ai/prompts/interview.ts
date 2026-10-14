import type { Difficulty } from "@codementor/shared";
import { UNTRUSTED_NOTICE, wrapUntrusted } from "../untrusted.js";

// Prompts are versioned. When you change wording, bump the version: AiCall rows record which
// version produced each call, so quality changes can be traced.

export const PLAN_PROMPT_VERSION = "interview-plan.v1";
export const QUESTION_PROMPT_VERSION = "interview-question.v1";
export const FOLLOW_UP_PROMPT_VERSION = "interview-followup.v1";

const JSON_ONLY = "Reply with ONLY one JSON object. No markdown fences, no commentary.";

export interface PlanSlot {
  topic: string;
  kind: "CONCEPTUAL" | "BEHAVIORAL";
  focus: string;
}

export function buildPlanPrompt(input: {
  topic: string;
  difficulty: Difficulty;
  questionCount: number;
}) {
  return {
    promptVersion: PLAN_PROMPT_VERSION,
    system: [
      "You are a senior software engineer designing a mock technical interview.",
      UNTRUSTED_NOTICE,
      `Plan exactly ${input.questionCount} interview questions as "slots". Cover different sub-topics, ordered from warm-up to hardest, suitable for ${input.difficulty} level.`,
      'Use kind "CONCEPTUAL" for technical-knowledge questions and "BEHAVIORAL" at most once, for a question about working experience.',
      `Shape: {"slots":[{"topic":"short sub-topic","kind":"CONCEPTUAL","focus":"what this question should probe"}]}`,
      JSON_ONLY,
    ].join("\n"),
    user: `Main topic:\n${wrapUntrusted("interview_topic", input.topic)}\nDifficulty: ${input.difficulty}\nNumber of slots: ${input.questionCount}`,
    maxTokens: 900,
    meta: { ...input },
  };
}

export type DifficultyAdjustment = "easier" | "same" | "harder";

export function buildQuestionPrompt(input: {
  topic: string;
  difficulty: Difficulty;
  slot: PlanSlot;
  slotIndex: number;
  adjustment: DifficultyAdjustment;
  askedBefore: string[];
}) {
  return {
    promptVersion: QUESTION_PROMPT_VERSION,
    system: [
      "You are a friendly but rigorous technical interviewer asking ONE question at a time.",
      UNTRUSTED_NOTICE,
      "Ask a single, self-contained question that can be answered in writing in a few paragraphs. Do not include the answer or hints.",
      "Never repeat or closely paraphrase a question that was already asked.",
      `Shape: {"question":"..."}`,
      JSON_ONLY,
    ].join("\n"),
    user: [
      `Main topic:\n${wrapUntrusted("interview_topic", input.topic)}`,
      `Base difficulty: ${input.difficulty}. Adjust this question to be: ${input.adjustment}.`,
      `Sub-topic: ${input.slot.topic}. Probe: ${input.slot.focus}. Type: ${input.slot.kind}.`,
      `Questions already asked (do not repeat): ${JSON.stringify(input.askedBefore)}`,
    ].join("\n"),
    maxTokens: 500,
    meta: { ...input },
  };
}

export function buildFollowUpPrompt(input: {
  topic: string;
  difficulty: Difficulty;
  direction: "SIMPLER" | "DEEPER";
  question: string;
  answer: string;
  weaknesses: string[];
  askedBefore: string[];
}) {
  const goal =
    input.direction === "SIMPLER"
      ? "The candidate struggled. Ask a simpler, more guided follow-up on the same concept that helps them show what they do know."
      : "The candidate gave a partial answer. Ask a follow-up that probes deeper into a gap, an edge case or a trade-off they missed.";
  return {
    promptVersion: FOLLOW_UP_PROMPT_VERSION,
    system: [
      "You are a technical interviewer asking a follow-up question.",
      UNTRUSTED_NOTICE,
      goal,
      "Ask ONE self-contained question. Do not reveal the correct answer.",
      `Shape: {"question":"..."}`,
      JSON_ONLY,
    ].join("\n"),
    user: [
      `Main topic:\n${wrapUntrusted("interview_topic", input.topic)}`,
      `Previous question: ${input.question}`,
      `Candidate's answer:\n${wrapUntrusted("candidate_answer", input.answer)}`,
      `Gaps noted by the evaluator: ${JSON.stringify(input.weaknesses)}`,
      `Questions already asked (do not repeat): ${JSON.stringify(input.askedBefore)}`,
    ].join("\n"),
    maxTokens: 500,
    meta: { ...input },
  };
}
