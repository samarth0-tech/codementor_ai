export type StatusKind =
  "PENDING" | "OK" | "WRONG_ANSWER" | "TIME_LIMIT" | "COMPILE_ERROR" | "RUNTIME_ERROR" | "INTERNAL";

/**
 * Judge0 status ids: 1 In Queue, 2 Processing, 3 Accepted, 4 Wrong Answer, 5 Time Limit Exceeded,
 * 6 Compilation Error, 7-12 Runtime Error (SIGSEGV, SIGXFSZ, SIGFPE, SIGABRT, NZEC, Other),
 * 13 Internal Error, 14 Exec Format Error.
 *
 * We do not send expected_output, so "3 Accepted" only means "ran to completion"; the application
 * compares the output itself (see compare.ts).
 */
export function interpretStatus(statusId: number): StatusKind {
  if (statusId === 1 || statusId === 2) return "PENDING";
  if (statusId === 3) return "OK";
  if (statusId === 4) return "WRONG_ANSWER";
  if (statusId === 5) return "TIME_LIMIT";
  if (statusId === 6) return "COMPILE_ERROR";
  if (statusId >= 7 && statusId <= 12) return "RUNTIME_ERROR";
  // 13, 14 and anything we do not recognise: the sandbox is broken or speaks a newer protocol.
  // That is our problem, never the student's.
  return "INTERNAL";
}
