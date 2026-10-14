import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(level: string): Logger {
  return pino({
    level,
    // Never write credentials into logs.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.passwordHash",
        "*.sourceCode",
        "*.extractedText",
      ],
      censor: "[redacted]",
    },
  });
}
