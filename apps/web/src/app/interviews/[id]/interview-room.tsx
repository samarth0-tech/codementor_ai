"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MAX_ANSWER_CHARS, type InterviewDetail, type QuestionDto } from "@codementor/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DifficultyBadge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import {
  STATUS_LABEL,
  TONE_BAR,
  formatRemaining,
  scoreTone,
  secondsSince,
} from "@/lib/interview-ui";
import { useDraft } from "@/lib/use-draft";
import { ReportView } from "./report-view";

type Response = { interview: InterviewDetail };

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.requestId
      ? `${error.message} (ref ${error.requestId.slice(0, 8)})`
      : error.message;
  }
  return "Something went wrong. Please try again.";
}

function Countdown({
  expiresAt,
  active,
  onExpire,
}: {
  expiresAt: string;
  active: boolean;
  onExpire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const remaining = Date.parse(expiresAt) - now;
  const expired = active && remaining <= 0;
  useEffect(() => {
    if (expired) onExpire();
  }, [expired, onExpire]);

  if (!active) return null;
  return (
    <span
      className={`font-mono text-sm ${remaining < 120_000 ? "text-red-600 dark:text-red-400" : ""}`}
      aria-label="Time remaining"
    >
      {formatRemaining(remaining)}
    </span>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-slate-500 dark:text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-1.5 rounded-full ${TONE_BAR[scoreTone(value * 10)]}`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className="w-8 text-right">{value}/10</span>
    </div>
  );
}

function QuestionCard({ q, number }: { q: QuestionDto; number: number }) {
  const evaluation = q.answer?.evaluation;
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
          {q.kind === "FOLLOW_UP" ? "Follow-up" : `Q${number}`}
        </span>
        <p className="font-medium">{q.text}</p>
      </div>
      {q.answer ? (
        <div className="space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
          <p className="whitespace-pre-wrap text-sm">{q.answer.text}</p>
          {evaluation ? (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60">
              <p className="text-sm font-semibold">Score: {evaluation.score}/100</p>
              <ScoreBar label="Correctness" value={evaluation.correctness} />
              <ScoreBar label="Depth" value={evaluation.depth} />
              <ScoreBar label="Clarity" value={evaluation.clarity} />
              <p className="text-sm">{evaluation.feedback}</p>
              {evaluation.weaknesses.length > 0 ? (
                <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-slate-300">
                  {evaluation.weaknesses.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Not evaluated yet.</p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function AnswerBox({
  question,
  pending,
  onSubmit,
}: {
  question: QuestionDto;
  pending: boolean;
  onSubmit: (answer: string) => void;
}) {
  const [text, setText] = useDraft(`answer:${question.id}`);
  const trimmed = text.trim();
  return (
    <Card className="space-y-3">
      <label htmlFor="answer" className="text-sm font-medium">
        Your answer
      </label>
      <textarea
        id="answer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_ANSWER_CHARS}
        rows={8}
        disabled={pending}
        placeholder="Explain your thinking. Examples and trade-offs score higher."
        className="block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {text.length}/{MAX_ANSWER_CHARS} &middot; saved on this device
        </span>
        <Button
          type="button"
          disabled={pending || trimmed.length === 0}
          onClick={() => onSubmit(trimmed)}
        >
          {pending ? "Evaluating your answer..." : "Submit answer"}
        </Button>
      </div>
    </Card>
  );
}

export function InterviewRoom({ initial }: { initial: InterviewDetail }) {
  const queryClient = useQueryClient();
  const key = ["interview", initial.id];
  const { data: interview } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<Response>(`/interviews/${initial.id}`)).interview,
    initialData: initial,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const options = {
    onSuccess: (res: Response) => queryClient.setQueryData(key, res.interview),
    // After a failure the server may still have saved the answer: reload the real state.
    onError: () => void refresh(),
  };
  const submit = useMutation({
    mutationFn: (v: { questionId: string; answer: string; timeTakenSec: number }) =>
      api.post<Response>(`/interviews/${initial.id}/answers`, v),
    ...options,
  });
  const retry = useMutation({
    mutationFn: () => api.post<Response>(`/interviews/${initial.id}/retry`),
    ...options,
  });
  const complete = useMutation({
    mutationFn: () => api.post<Response>(`/interviews/${initial.id}/complete`),
    ...options,
  });
  const abandon = useMutation({
    mutationFn: () => api.post<Response>(`/interviews/${initial.id}/abandon`),
    ...options,
  });

  const current = interview.questions.find((q) => q.id === interview.currentQuestionId) ?? null;
  const active = interview.status === "IN_PROGRESS";
  const busy = submit.isPending || retry.isPending || complete.isPending || abandon.isPending;
  const error = [submit, retry, complete, abandon].find((m) => m.isError)?.error;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{interview.topic}</h1>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <DifficultyBadge difficulty={interview.difficulty} />
            <span>{STATUS_LABEL[interview.status]}</span>
            <span>
              &middot; {interview.answeredCount} answered of about {interview.plannedQuestionCount}
            </span>
          </div>
        </div>
        <Countdown
          expiresAt={interview.expiresAt}
          active={active}
          onExpire={() => void refresh()}
        />
      </Card>

      {error ? <Alert tone="error">{messageFor(error)}</Alert> : null}

      {interview.status === "EXPIRED" ? (
        <Alert tone="info">
          Time is up. You can no longer answer, but you can finish now to get your report for the
          questions you answered.
        </Alert>
      ) : null}

      {interview.questions.map((q) => (
        <QuestionCard key={q.id} q={q} number={q.slotIndex + 1} />
      ))}

      {interview.needsRetry ? (
        <Alert tone="info">
          Your answer is saved, but the next step did not finish (the AI may be busy).{" "}
          <button
            type="button"
            className="font-medium underline disabled:opacity-60"
            disabled={busy}
            onClick={() => retry.mutate()}
          >
            {retry.isPending ? "Retrying..." : "Retry now"}
          </button>
        </Alert>
      ) : null}

      {current ? (
        <AnswerBox
          key={current.id}
          question={current}
          pending={submit.isPending}
          onSubmit={(answer) => {
            submit.mutate({
              questionId: current.id,
              answer,
              timeTakenSec: secondsSince(current.askedAt, Date.now()),
            });
          }}
        />
      ) : null}

      {(active || interview.status === "EXPIRED") && interview.answeredCount > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {active ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Abandon this interview? You will not get a report."))
                  abandon.mutate();
              }}
            >
              Abandon
            </Button>
          ) : null}
          <Button variant="secondary" disabled={busy} onClick={() => complete.mutate()}>
            {complete.isPending ? "Preparing report..." : "Finish and get report"}
          </Button>
        </div>
      ) : active ? (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Abandon this interview?")) abandon.mutate();
            }}
          >
            Abandon
          </Button>
        </div>
      ) : null}

      {interview.report ? <ReportView report={interview.report} /> : null}
    </div>
  );
}
