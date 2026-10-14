import { RUBRIC, type Difficulty } from "@codementor/shared";
import { UNTRUSTED_NOTICE, wrapUntrusted } from "../untrusted.js";

export const EVALUATION_PROMPT_VERSION = "evaluation.v1";
export const REPORT_PROMPT_VERSION = "report.v1";

const JSON_ONLY = "Reply with ONLY one JSON object. No markdown fences, no commentary.";

export function buildEvaluationPrompt(input: {
  topic: string;
  difficulty: Difficulty;
  question: string;
  answer: string;
}) {
  const criteria = RUBRIC.map((c) => `- ${c.key}: ${c.label}. ${c.description}`).join("\n");
  return {
    promptVersion: EVALUATION_PROMPT_VERSION,
    system: [
      "You are a strict, fair technical interviewer grading ONE written answer.",
      UNTRUSTED_NOTICE,
      "Rate each criterion as a whole number from 0 to 10 (0 = missing or wrong, 5 = partly right, 10 = excellent for the stated difficulty):",
      criteria,
      "You only provide the three ratings and written feedback. Do NOT compute a total score; the application does that.",
      "Be concrete: strengths and weaknesses must refer to what the answer actually says (at most 3 of each, one sentence each).",
      `Shape: {"correctness":0,"depth":0,"clarity":0,"strengths":["..."],"weaknesses":["..."],"feedback":"2-4 sentences speaking to the candidate"}`,
      JSON_ONLY,
    ].join("\n"),
    user: [
      `Interview topic:\n${wrapUntrusted("interview_topic", input.topic)}`,
      `Difficulty: ${input.difficulty}`,
      `Question: ${input.question}`,
      `Candidate's answer:\n${wrapUntrusted("candidate_answer", input.answer)}`,
    ].join("\n"),
    maxTokens: 900,
    meta: { ...input },
  };
}

export interface ReportResultRow {
  question: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
}

export function buildReportPrompt(input: {
  topic: string;
  difficulty: Difficulty;
  overall: number;
  band: string;
  results: ReportResultRow[];
}) {
  return {
    promptVersion: REPORT_PROMPT_VERSION,
    system: [
      "You write the written summary of a mock technical interview for the candidate.",
      UNTRUSTED_NOTICE,
      "The scores are final and were computed by the application. Do not recalculate, restate different numbers, or change the band.",
      "Base everything ONLY on the per-question results provided. Be specific, encouraging and practical.",
      `Shape: {"summary":"3-5 sentences","strengths":["..."],"weaknesses":["..."],"recommendations":["concrete next study actions, 1-5 items"]}`,
      JSON_ONLY,
    ].join("\n"),
    user: [
      `Interview topic:\n${wrapUntrusted("interview_topic", input.topic)}`,
      `Difficulty: ${input.difficulty}. Overall score: ${input.overall}/100 (${input.band}).`,
      `Per-question results: ${JSON.stringify(input.results)}`,
    ].join("\n"),
    maxTokens: 1200,
    meta: { ...input },
  };
}
