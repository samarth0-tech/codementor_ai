import type { RequestHandler } from "express";
import { verifyAssertion } from "@codementor/shared/assertion";
import { AppError } from "../lib/errors.js";

/**
 * Every request to the API (except /health) must carry a valid, unexpired identity note signed
 * by our Next.js server. This makes Express a private backend of the web app.
 */
export function requireAssertion(secret: string): RequestHandler {
  return async (req, _res, next) => {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
    if (!token) {
      throw AppError.unauthenticated("Missing identity assertion", "MISSING_ASSERTION");
    }
    try {
      req.assertion = await verifyAssertion(secret, token);
    } catch {
      throw AppError.unauthenticated("Invalid or expired identity assertion", "INVALID_ASSERTION");
    }
    next();
  };
}
