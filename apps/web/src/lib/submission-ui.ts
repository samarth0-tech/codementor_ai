import { isTerminalStatus, type SubmissionStatus, type Verdict } from "@codementor/shared";

export const VERDICT_LABEL: Record<Verdict, string> = {
  ACCEPTED: "Accepted",
  WRONG_ANSWER: "Wrong answer",
  TIME_LIMIT: "Time limit exceeded",
  MEMORY_LIMIT: "Memory limit exceeded",
  RUNTIME_ERROR: "Runtime error",
  COMPILE_ERROR: "Compilation error",
  INTERNAL_ERROR: "Internal error (not your fault)",
};

export type Tone = "success" | "error" | "warn" | "neutral";

export function verdictTone(verdict: Verdict | null): Tone {
  if (verdict === null) return "neutral";
  if (verdict === "ACCEPTED") return "success";
  if (verdict === "INTERNAL_ERROR") return "warn";
  return "error";
}

export const TONE_CLASS: Record<Tone, string> = {
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  error: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};

/** How often to ask the server for a result: keep polling until it is finished, then stop. */
export function pollIntervalMs(status: SubmissionStatus | undefined): number | false {
  if (status !== undefined && isTerminalStatus(status)) return false;
  return 800;
}

export const formatTime = (ms: number | null): string => (ms === null ? "-" : `${ms} ms`);

export function formatMemory(kb: number | null): string {
  if (kb === null) return "-";
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

/** The editor stores code under a prefix so that an intentionally EMPTY editor is remembered too. */
const CODE_PREFIX = "c:";
export const encodeCode = (code: string): string => CODE_PREFIX + code;
export const decodeCode = (raw: string): string | null =>
  raw.startsWith(CODE_PREFIX) ? raw.slice(CODE_PREFIX.length) : null;
