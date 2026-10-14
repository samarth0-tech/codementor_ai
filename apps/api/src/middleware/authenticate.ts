import type { RequestHandler } from "express";
import { AppError } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";

/**
 * Requires a signed-in user. The note proves WHO the web app says is calling; this middleware
 * then loads that user from PostgreSQL, so suspensions and role changes apply immediately.
 * The role is taken from the database, never from the note.
 */
export function createAuthenticate(prisma: PrismaClient): RequestHandler {
  return async (req, _res, next) => {
    const userId = req.assertion?.sub;
    if (!userId) throw AppError.unauthenticated();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    if (!user) throw AppError.unauthenticated("Account not found", "ACCOUNT_NOT_FOUND");
    if (user.status !== "ACTIVE") {
      throw AppError.forbidden("This account is suspended", "ACCOUNT_SUSPENDED");
    }
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  };
}
