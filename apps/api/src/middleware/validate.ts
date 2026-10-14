import type { RequestHandler } from "express";
import type { ZodType } from "zod";

/** Validates req.body with a Zod schema and replaces it with the parsed (cleaned) value. */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}
