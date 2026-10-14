export type ErrorDetails = unknown;

/** An error we expect and know how to describe to the client. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, details?: ErrorDetails) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }
  static validation(details: ErrorDetails) {
    return new AppError(400, "VALIDATION_FAILED", "Request validation failed", details);
  }
  static unauthenticated(message = "Authentication required", code = "UNAUTHENTICATED") {
    return new AppError(401, code, message);
  }
  static forbidden(message = "You do not have permission to do this", code = "FORBIDDEN") {
    return new AppError(403, code, message);
  }
  static notFound(message = "Resource not found") {
    return new AppError(404, "NOT_FOUND", message);
  }
  static conflict(message: string, code = "CONFLICT") {
    return new AppError(409, code, message);
  }
  static tooManyRequests(message = "Too many requests, please try again later") {
    return new AppError(429, "RATE_LIMITED", message);
  }
  static upstream(message: string, code = "UPSTREAM_ERROR") {
    return new AppError(502, code, message);
  }
  static unavailable(message: string, code = "SERVICE_UNAVAILABLE") {
    return new AppError(503, code, message);
  }
}
