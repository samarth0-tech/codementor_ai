import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const SAFE_ID = /^[\w-]{8,64}$/;

/** Gives every request an id, returned in the x-request-id header and included in logs/errors. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
};
