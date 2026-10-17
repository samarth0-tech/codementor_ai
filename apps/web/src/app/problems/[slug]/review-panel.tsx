"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CodeReviewDto, SubmissionDetail } from "@codementor/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import {
  SEVERITY_CLASS,
  SEVERITY_LABEL,
  canRequestReview,
  ratingBarClass,
  reviewErrorMessage,
} from "@/lib/review-ui";

function Rating({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span>{value}/10</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-2 rounded-full ${ratingBarClass(value)}`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
      {note ? <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p> : null}
    </div>
  );
}

function ReviewView({ review, simulated }: { review: CodeReviewDto; simulated: boolean }) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold">AI code review</h2>
        <p className="text-sm">
          Quality score <span className="text-2xl font-bold">{review.overallScore}</span>
          <span className="text-slate-500">/100</span>
        </p>
      </div>

      {simulated ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This submission&apos;s test result was simulated, so the review had no real test evidence.
        </p>
      ) : null}

      {/* Plain text only: nothing the AI writes is ever interpreted as HTML. */}
      <p className="text-sm leading-relaxed">{review.summary}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Rating
          label="Correctness"
          value={review.ratings.correctness}
          note={review.notes.correctness}
        />
        <Rating
          label="Readability"
          value={review.ratings.readability}
          note={review.notes.readability}
        />
        <Rating
          label="Maintainability"
          value={review.ratings.maintainability}
          note={review.notes.maintainability}
        />
      </div>
      {review.correctnessAdjusted ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The correctness rating takes your real test result (
          {review.verdictAtReview.toLowerCase().replace(/_/g, " ")}) into account.
        </p>
      ) : null}

      <section className="space-y-1 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <h3 className="text-sm font-semibold">
          Complexity <span className="font-normal text-slate-500">(AI estimate, not a proof)</span>
        </h3>
        <p className="font-mono text-sm">
          Time {review.complexity.time} &middot; Space {review.complexity.space}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {review.complexity.explanation}
        </p>
      </section>

      {review.bugs.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Possible bugs</h3>
          <ul className="space-y-2">
            {review.bugs.map((bug, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASS[bug.severity]}`}
                  >
                    {SEVERITY_LABEL[bug.severity]}
                  </span>
                  <span className="font-medium">{bug.title}</span>
                  {bug.line !== null ? (
                    <span className="text-xs text-slate-500">line {bug.line}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-slate-700 dark:text-slate-300">{bug.description}</p>
                {bug.fix ? (
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                    Hint: {bug.fix}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review.suggestions.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Suggestions</h3>
          <ul className="space-y-2">
            {review.suggestions.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASS[s.priority]}`}
                  >
                    {SEVERITY_LABEL[s.priority]}
                  </span>
                  <span className="font-medium">{s.title}</span>
                </div>
                <p className="mt-1 text-slate-700 dark:text-slate-300">{s.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review.strengths.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">What you did well</h3>
          <ul className="list-disc pl-5 text-sm text-slate-700 dark:text-slate-300">
            {review.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Shown under the results of a finished submission: loads an existing review or asks for one. */
export function ReviewPanel({ submission }: { submission: SubmissionDetail | undefined }) {
  const queryClient = useQueryClient();
  const id = canRequestReview(submission) && submission ? submission.id : null;

  const existing = useQuery({
    queryKey: ["review", id],
    enabled: id !== null,
    retry: false,
    queryFn: async () => {
      try {
        return (await api.get<{ review: CodeReviewDto }>(`/submissions/${id}/review`)).review;
      } catch (error) {
        if (error instanceof ApiError && error.code === "REVIEW_NOT_FOUND") return null; // none yet
        throw error;
      }
    },
  });

  const create = useMutation({
    mutationFn: () => api.post<{ review: CodeReviewDto }>(`/submissions/${id}/review`),
    onSuccess: ({ review }) => queryClient.setQueryData(["review", id], review),
  });

  if (id === null || !submission) return null;
  const review = existing.data ?? null;

  return (
    <Card className="p-0">
      {review ? (
        <ReviewView review={review} simulated={submission.executor === "mock"} />
      ) : existing.isPending ? (
        <p className="p-4 text-sm text-slate-500" role="status">
          Checking for a review...
        </p>
      ) : (
        <div className="space-y-3 p-4">
          <h2 className="text-lg font-semibold">AI code review</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Get feedback on correctness, readability, maintainability and time/space complexity,
            with hints to improve. It uses AI and takes a few seconds.
          </p>
          {create.isError ? <Alert tone="error">{reviewErrorMessage(create.error)}</Alert> : null}
          {existing.isError ? (
            <Alert tone="error">{reviewErrorMessage(existing.error)}</Alert>
          ) : null}
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Reviewing your code..." : "Get AI code review"}
          </Button>
        </div>
      )}
    </Card>
  );
}
