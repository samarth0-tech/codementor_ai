import { Router, type RequestHandler } from "express";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "@codementor/shared";
import { AppError } from "../../lib/errors.js";
import { createLimiter, type Limits } from "../../middleware/rateLimit.js";
import { validateBody } from "../../middleware/validate.js";
import type { AuthService } from "./auth.service.js";

interface AuthRouterDeps {
  service: AuthService;
  authenticate: RequestHandler;
  limits: Limits;
}

const emailFromBody = (body: unknown): string =>
  String((body as { email?: unknown })?.email ?? "")
    .toLowerCase()
    .slice(0, 254);

export function createAuthRouter({ service, authenticate, limits }: AuthRouterDeps): Router {
  const router = Router();

  // Called (through the web app) when someone signs up.
  router.post(
    "/register",
    createLimiter(limits.register),
    validateBody(registerSchema),
    async (req, res) => {
      const user = await service.register(req.body as RegisterInput);
      res.status(201).json({ user });
    },
  );

  // Called ONLY by the Next.js server from Auth.js's authorize(). Returns the user, no tokens.
  router.post(
    "/verify-credentials",
    createLimiter({ ...limits.login, keyExtra: (req) => emailFromBody(req.body) }),
    validateBody(loginSchema),
    async (req, res) => {
      const user = await service.verifyCredentials(req.body as LoginInput);
      if (!user) {
        throw AppError.unauthenticated("Invalid email or password", "INVALID_CREDENTIALS");
      }
      res.json({ user });
    },
  );

  router.get("/me", authenticate, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
