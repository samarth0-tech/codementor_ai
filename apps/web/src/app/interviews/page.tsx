import type { Metadata } from "next";
import Link from "next/link";
import type { InterviewSummary, Paginated } from "@codementor/shared";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DifficultyBadge } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/lib/interview-ui";
import { serverGet } from "@/lib/server/api";

export const metadata: Metadata = { title: "AI Interviews & Reports" };

export default async function InterviewsPage() {
  const { data, meta } = await serverGet<Paginated<InterviewSummary>>("/interviews?limit=30");
  const active = data.find((i) => i.status === "IN_PROGRESS");
  const completed = data.filter((i) => i.status === "COMPLETED");

  const avgScore =
    completed.length > 0
      ? Math.round(completed.reduce((acc, i) => acc + (i.overallScore ?? 0), 0) / completed.length)
      : null;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Interview History & Reports
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review your past mock interviews, AI feedback, question evaluations, and personalized
            action plans.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {active ? (
            <ButtonLink href={`/interviews/${active.id}`} className="text-xs sm:text-sm">
              Continue Active Interview
            </ButtonLink>
          ) : (
            <ButtonLink href="/interviews/new" className="text-xs sm:text-sm">
              Start New Interview
            </ButtonLink>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Sessions
          </p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
            {meta.total}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Completed Reports
          </p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {completed.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Average Score
          </p>
          <p className="mt-1 text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
            {avgScore !== null ? `${avgScore}%` : "—"}
          </p>
        </Card>
      </div>

      {/* Interview List */}
      {data.length === 0 ? (
        <Card className="flex flex-col items-center justify-center space-y-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            🎙️
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white">No interviews yet</h3>
          <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
            Choose a topic or upload your resume. Our AI interviewer will conduct an adaptive mock
            interview and generate a detailed report.
          </p>
          <ButtonLink href="/interviews/new" className="mt-2 text-xs">
            Start Your First Interview
          </ButtonLink>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">All Sessions</h2>
          <ul className="space-y-3">
            {data.map((i) => {
              const isCompleted = i.status === "COMPLETED";
              const isInProgress = i.status === "IN_PROGRESS";

              return (
                <li key={i.id}>
                  <Link href={`/interviews/${i.id}`} className="block">
                    <Card className="flex flex-wrap items-center justify-between gap-4 p-4 transition hover:border-indigo-400 hover:shadow-sm">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900 dark:text-white">{i.topic}</p>
                          <DifficultyBadge difficulty={i.difficulty} />
                          {i.type === "RESUME" ? (
                            <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-800 dark:bg-purple-950/80 dark:text-purple-300">
                              📄 Resume Interview
                            </span>
                          ) : (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Topic Interview
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(i.startedAt).toLocaleDateString("en-GB", {
                            dateStyle: "medium",
                          })}{" "}
                          • {i.answeredCount} answered of {i.plannedQuestionCount} planned
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : isInProgress
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {STATUS_LABEL[i.status]}
                        </span>

                        {i.overallScore !== null ? (
                          <div className="text-right">
                            <span className="text-lg font-bold text-slate-900 dark:text-white">
                              {Math.round(i.overallScore)}
                            </span>
                            <span className="text-xs text-slate-500">/100</span>
                          </div>
                        ) : null}

                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          {isCompleted ? "View Report →" : isInProgress ? "Continue →" : "View →"}
                        </span>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
