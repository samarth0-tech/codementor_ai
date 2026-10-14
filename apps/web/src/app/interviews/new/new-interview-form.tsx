"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DIFFICULTIES, createInterviewSchema, type InterviewDetail } from "@codementor/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

const select =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
const TOPIC_IDEAS = [
  "JavaScript closures",
  "SQL joins and indexes",
  "REST API design",
  "Operating systems",
  "Data structures",
];

function describe(error: unknown): { message: string; activeId?: string } {
  if (error instanceof ApiError) {
    if (error.code === "INTERVIEW_ALREADY_ACTIVE") {
      const id = (error.details as { interviewId?: string } | undefined)?.interviewId;
      return {
        message: "You already have an interview in progress.",
        ...(id ? { activeId: id } : {}),
      };
    }
    if (error.code === "AI_NOT_CONFIGURED") {
      return { message: "AI interviews are not set up on this server yet." };
    }
    return { message: error.message };
  }
  return { message: "Something went wrong. Please try again." };
}

export function NewInterviewForm() {
  const router = useRouter();
  const [fieldError, setFieldError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<{ interview: InterviewDetail }>("/interviews", body),
    onSuccess: ({ interview }) => router.push(`/interviews/${interview.id}`),
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = createInterviewSchema.safeParse({
      topic: form.get("topic"),
      difficulty: form.get("difficulty"),
      questionCount: Number(form.get("questionCount")),
      durationMinutes: Number(form.get("durationMinutes")),
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setFieldError(null);
    create.mutate(parsed.data);
  }

  const failure = create.isError ? describe(create.error) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {failure ? (
        <Alert tone="error">
          {failure.message}{" "}
          {failure.activeId ? (
            <Link href={`/interviews/${failure.activeId}`} className="font-medium underline">
              Continue it
            </Link>
          ) : null}
        </Alert>
      ) : null}
      <Input
        label="Topic"
        name="topic"
        list="topic-ideas"
        placeholder="e.g. JavaScript closures"
        maxLength={80}
        required
        {...(fieldError ? { error: fieldError } : {})}
      />
      <datalist id="topic-ideas">
        {TOPIC_IDEAS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm font-medium">
          Difficulty
          <select name="difficulty" defaultValue="MEDIUM" className={select}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Questions
          <select name="questionCount" defaultValue="5" className={select}>
            {[3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Time limit
          <select name="durationMinutes" defaultValue="30" className={select}>
            {[15, 30, 45, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Follow-up questions are extra: the interviewer may dig deeper (or simplify) based on your
        answers.
      </p>
      <Button type="submit" className="w-full" disabled={create.isPending}>
        {create.isPending ? "Preparing your interview..." : "Start interview"}
      </Button>
    </form>
  );
}
