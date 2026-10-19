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

import { ResumeUploader } from "@/components/interviews/resume-uploader";
import type { ResumeDetailDto, ResumeSummaryDto } from "@codementor/shared";

export function NewInterviewForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"TOPIC" | "RESUME">("TOPIC");
  const [selectedResume, setSelectedResume] = useState<ResumeDetailDto | ResumeSummaryDto | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<{ interview: InterviewDetail }>("/interviews", body),
    onSuccess: ({ interview }) => router.push(`/interviews/${interview.id}`),
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    if (mode === "RESUME" && !selectedResume) {
      setFieldError("Please upload or select a resume for a resume-based interview.");
      return;
    }

    const topicValue = String(form.get("topic") || "").trim() || (selectedResume ? `${selectedResume.skills.slice(0, 3).join(", ") || "Full Stack"} (Resume-based)` : "Technical Interview");

    const parsed = createInterviewSchema.safeParse({
      type: mode,
      topic: topicValue,
      difficulty: form.get("difficulty"),
      questionCount: Number(form.get("questionCount")),
      durationMinutes: Number(form.get("durationMinutes")),
      ...(mode === "RESUME" && selectedResume ? { resumeId: selectedResume.id } : {}),
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
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setMode("TOPIC");
            setFieldError(null);
          }}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
            mode === "TOPIC"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          Topic-based Interview
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("RESUME");
            setFieldError(null);
          }}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
            mode === "RESUME"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          Resume-based Interview
        </button>
      </div>

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

        {mode === "RESUME" ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Candidate Resume</label>
            <ResumeUploader
              selectedResumeId={selectedResume?.id}
              onSelectResume={(r) => {
                setSelectedResume(r);
                if (r) setFieldError(null);
              }}
            />
            {selectedResume ? (
              <div className="rounded-md bg-blue-50/60 p-3 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <span className="font-semibold">Selected: {selectedResume.fileName}</span> — Questions will probe your projects, technologies, and claimed background.
              </div>
            ) : null}
          </div>
        ) : null}

        <Input
          label={mode === "RESUME" ? "Focus Topic or Domain (Optional)" : "Topic"}
          name="topic"
          list="topic-ideas"
          placeholder={mode === "RESUME" ? "e.g. Distributed Systems (or leave blank to use resume skills)" : "e.g. JavaScript closures"}
          maxLength={80}
          required={mode === "TOPIC"}
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
          {create.isPending ? "Preparing your tailored interview..." : mode === "RESUME" ? "Start resume interview" : "Start interview"}
        </Button>
      </form>
    </div>
  );
}
