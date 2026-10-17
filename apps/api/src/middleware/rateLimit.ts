import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { AppError } from "../lib/errors.js";

export interface LimitConfig {
  windowMs: number;
  limit: number;
}

export interface Limits {
  register: LimitConfig;
  login: LimitConfig;
  interviewCreate: LimitConfig;
  interviewAnswer: LimitConfig;
  submissionCreate: LimitConfig;
  codeReview: LimitConfig;
}

export const defaultLimits: Limits = {
  register: { windowMs: 60 * 60 * 1000, limit: 10 },
  login: { windowMs: 15 * 60 * 1000, limit: 10 },
  // AI endpoints cost real money, so they are limited per signed-in USER, not per IP.
  interviewCreate: { windowMs: 60 * 60 * 1000, limit: 10 },
  interviewAnswer: { windowMs: 10 * 60 * 1000, limit: 60 },
  // Code runs are expensive too (Judge0 from Phase 9): limited per user.
  submissionCreate: { windowMs: 10 * 60 * 1000, limit: 30 },
  // AI code reviews cost money: limited per user.
  codeReview: { windowMs: 60 * 60 * 1000, limit: 15 },
};

/** Who is calling? The real client IP travels inside the signed note (Express only sees Next.js). */
export function clientKey(req: Request): string {
  return req.assertion?.ip ? ipKeyGenerator(req.assertion.ip) : "unknown";
}

interface LimiterOptions extends LimitConfig {
  /** Extra text to add to the key, e.g. the email being attempted. */
  keyExtra?: (req: Request) => string;
  /** "user" keys the limit by signed-in user id (falls back to client IP). Default: client IP. */
  keyBy?: "client" | "user";
}

/**
 * In-memory limiter: fine for a single API instance. To scale to several instances,
 * swap in a shared store (e.g. Redis) without changing the call sites.
 */
export function createLimiter({
  windowMs,
  limit,
  keyExtra,
  keyBy,
}: LimiterOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${keyBy === "user" && req.user ? `user:${req.user.id}` : clientKey(req)}|${keyExtra?.(req) ?? ""}`,
    handler: (_req, _res, next) => next(AppError.tooManyRequests()),
  });
}
