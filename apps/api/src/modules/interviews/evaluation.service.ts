import {
  RUBRIC_VERSION,
  computeAnswerScore,
  computeReportScores,
  type Difficulty,
  type EvaluatedAnswer,
} from "@codementor/shared";
import { AppError } from "../../lib/errors.js";
import type { AiService } from "../ai/ai.service.js";
import { buildEvaluationPrompt, buildReportPrompt } from "../ai/prompts/evaluation.js";
import { evaluationSchema, narrativeSchema } from "../ai/schemas.js";

export interface AnswerEvaluationResult {
  correctness: number;
  depth: number;
  clarity: number;
  /** Computed here from the three ratings, never taken from the AI. */
  score: number;
  strengths: string[];
  weaknesses: string[];
  feedback: string;
  rubricVersion: string;
}

export interface ReportData {
  overallScore: number;
  correctnessScore: number;
  depthScore: number;
  clarityScore: number;
  band: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  aiNarrative: boolean;
  rubricVersion: string;
}

export interface EvaluatedQuestion extends EvaluatedAnswer {
  question: string;
  strengths: string[];
  weaknesses: string[];
}

/**
 * Phase 7. Two clearly separated jobs:
 *  - AI JUDGMENT: rate each criterion 0-10 and write feedback / a narrative.
 *  - DETERMINISTIC LOGIC (packages/shared/scoring.ts): turn ratings into scores and bands.
 */
export class EvaluationService {
  constructor(private readonly ai: AiService) {}

  async evaluateAnswer(input: {
    userId: string;
    topic: string;
    difficulty: Difficulty;
    question: string;
    answer: string;
  }): Promise<AnswerEvaluationResult> {
    const prompt = buildEvaluationPrompt(input);
    const rated = await this.ai.generateStructured({
      userId: input.userId,
      feature: "EVALUATION",
      tier: "reasoning",
      temperature: 0.2,
      schema: evaluationSchema,
      ...prompt,
    });
    return {
      ...rated,
      score: computeAnswerScore(rated),
      rubricVersion: RUBRIC_VERSION,
    };
  }

  /**
   * Scores are ALWAYS computed first from stored evaluations. The AI only adds the written
   * narrative; if it fails, a plain fallback is stored so finishing an interview never loses
   * the candidate's results.
   */
  async buildReport(input: {
    userId: string;
    topic: string;
    difficulty: Difficulty;
    evaluated: EvaluatedQuestion[];
  }): Promise<ReportData> {
    const scores = computeReportScores(input.evaluated);
    const base = {
      overallScore: scores.overall,
      correctnessScore: scores.correctness,
      depthScore: scores.depth,
      clarityScore: scores.clarity,
      band: scores.band,
      rubricVersion: RUBRIC_VERSION,
    };

    try {
      const prompt = buildReportPrompt({
        topic: input.topic,
        difficulty: input.difficulty,
        overall: scores.overall,
        band: scores.band,
        results: input.evaluated.map((e) => ({
          question: e.question,
          score: e.score,
          strengths: e.strengths,
          weaknesses: e.weaknesses,
        })),
      });
      const narrative = await this.ai.generateStructured({
        userId: input.userId,
        feature: "REPORT",
        tier: "reasoning",
        temperature: 0.4,
        schema: narrativeSchema,
        ...prompt,
      });
      return { ...base, ...narrative, aiNarrative: true };
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      return {
        ...base,
        ...fallbackNarrative(input.topic, scores.overall, scores.band, input.evaluated),
        aiNarrative: false,
      };
    }
  }
}

const unique = (items: string[], max: number) => [...new Set(items)].slice(0, max);

function fallbackNarrative(
  topic: string,
  overall: number,
  band: string,
  evaluated: EvaluatedQuestion[],
) {
  return {
    summary: `You answered ${evaluated.length} question${evaluated.length === 1 ? "" : "s"} on ${topic} and scored ${overall}/100 (${band}). A written AI summary could not be generated this time; the feedback on each answer below still applies.`,
    strengths: unique(
      evaluated.flatMap((e) => e.strengths),
      5,
    ),
    weaknesses: unique(
      evaluated.flatMap((e) => e.weaknesses),
      5,
    ),
    recommendations: [
      "Review the feedback on each answer and practise the topics you scored lowest on.",
    ],
  };
}
