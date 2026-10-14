import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound("Route not found"));
};

interface KnownError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function translate(err: unknown): KnownError | null {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    };
  }
  const anyErr = err as { type?: string; code?: string };
  // body-parser errors
  if (anyErr?.type === "entity.parse.failed") {
    return { status: 400, code: "INVALID_JSON", message: "Request body is not valid JSON" };
  }
  if (anyErr?.type === "entity.too.large") {
    return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
  }
  // Prisma: unique constraint violated / record not found
  if (anyErr?.code === "P2002") {
    return { status: 409, code: "CONFLICT", message: "A record with these values already exists" };
  }
  if (anyErr?.code === "P2025") {
    return { status: 404, code: "NOT_FOUND", message: "Resource not found" };
  }
  return null;
}

/** The ONE place errors become HTTP responses. Services throw; this formats. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const known = translate(err);
    if (known) {
      res.status(known.status).json({
        error: {
          code: known.code,
          message: known.message,
          ...(known.details !== undefined ? { details: known.details } : {}),
          requestId: req.id,
        },
      });
      return;
    }
    // Unknown error: log everything server-side, tell the client nothing internal.
    logger.error({ err, requestId: req.id }, "Unhandled error");
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId: req.id },
    });
  };
}
