import { bandFor, type InterviewStatus } from "@codementor/shared";

/** 125000 -> "2:05", 3725000 -> "1:02:05". Never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export const STATUS_LABEL: Record<InterviewStatus, string> = {
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  ABANDONED: "Abandoned",
  EXPIRED: "Time is up",
};

export type ScoreTone = "good" | "ok" | "low";

/** Same boundaries as the scoring bands in packages/shared (Excellent/Strong = good). */
export function scoreTone(score: number): ScoreTone {
  const band = bandFor(score);
  if (band === "Excellent" || band === "Strong") return "good";
  if (band === "Developing") return "ok";
  return "low";
}

export const TONE_BAR: Record<ScoreTone, string> = {
  good: "bg-emerald-500",
  ok: "bg-amber-500",
  low: "bg-red-500",
};

/** Seconds from `askedAt` to `now`, capped at the API limit of one day. */
export function secondsSince(askedAtIso: string, now: number): number {
  const seconds = Math.round((now - Date.parse(askedAtIso)) / 1000);
  return Math.min(86_400, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
}
