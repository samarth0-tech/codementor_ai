import type { RequestHandler } from "express";
import type { Role } from "@codementor/shared";
import { AppError } from "../lib/errors.js";

/** Use AFTER authenticate. Example: router.use(requireRole("ADMIN")). */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthenticated();
    if (!roles.includes(req.user.role)) throw AppError.forbidden();
    next();
  };
}
