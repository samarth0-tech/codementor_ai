import type { Severity, SubmissionDetail } from "@codementor/shared";
import { ApiError } from "@/lib/api/errors";

/** Only finished submissions can be reviewed, and not ones that failed on OUR side. */
export function canRequestReview(
  submission: Pick<SubmissionDetail, "status" | "verdict"> | undefined,
): boolean {
  return (
    submission !== undefined &&
    submission.status === "COMPLETED" &&
    submission.verdict !== null &&
    submission.verdict !== "INTERNAL_ERROR"
  );
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const SEVERITY_CLASS: Record<Severity, string> = {
  HIGH: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};

/** A friendly sentence for each way requesting a review can fail. */
export function reviewErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "AI_NOT_CONFIGURED":
        return "AI reviews are not set up on this server yet.";
      case "RATE_LIMITED":
        return "You have requested a lot of reviews. Please wait a while and try again.";
      case "AI_QUOTA_EXCEEDED":
        return "You have reached today's AI usage limit. Please try again tomorrow.";
      case "SUBMISSION_NOT_REVIEWABLE":
        return "This submission cannot be reviewed (it has not finished, or it failed on our side).";
      case "CODE_TOO_LARGE_FOR_REVIEW":
        return "This code is too long to review.";
      case "AI_TIMEOUT":
      case "AI_UNAVAILABLE":
      case "AI_BUSY":
      case "AI_INVALID_OUTPUT":
        return "The AI could not produce a review right now. Please try again in a moment.";
      default:
        return error.message;
    }
  }
  return "Something went wrong. Please try again.";
}

/** Rating 0-10 -> bar colour, using the same style as the interview scores. */
export function ratingBarClass(rating: number): string {
  if (rating >= 7) return "bg-emerald-500";
  if (rating >= 4) return "bg-amber-500";
  return "bg-red-500";
}
