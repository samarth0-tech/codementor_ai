import type { Metadata } from "next";
import Link from "next/link";
import type { LearningPathDetailDto } from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { DifficultyBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { serverGet } from "@/lib/server/api";
import { getStepStyle, formatEstimate } from "@/lib/paths-ui";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = await serverGet<LearningPathDetailDto>(`/paths/${slug}`);
  return { title: `${path.title} — Learning Path` };
}

export default async function PathDetailPage({ params }: Props) {
  const { slug } = await params;
  const path = await serverGet<LearningPathDetailDto>(`/paths/${slug}`);

  return (
    <div className="space-y-8 pb-8">
      {/* Back link + header */}
      <div className="space-y-4">
        <ButtonLink href="/paths" variant="ghost" className="text-xs">
          ← All Learning Paths
        </ButtonLink>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {path.title}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              {path.description}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <DifficultyBadge difficulty={path.difficulty} />
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {path.category}
              </span>
            </div>
          </div>

          {/* Progress summary */}
          <Card className="shrink-0 space-y-2 p-4 sm:min-w-[200px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {path.completedProblems} / {path.totalProblems}
              </span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {path.progressPercent}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                style={{ width: `${path.progressPercent}%` }}
              />
            </div>
            {path.completedProblems === path.totalProblems && path.totalProblems > 0 ? (
              <p className="text-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
                ✓ All problems completed!
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      {/* Steps / Roadmap */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Roadmap</h2>

        <ol className="relative border-l-2 border-slate-200 dark:border-slate-700">
          {path.steps.map((step, idx) => {
            const style = getStepStyle(step.status);
            const isLast = idx === path.steps.length - 1;
            const canNavigate = step.status !== "LOCKED";

            return (
              <li key={step.problemSlug} className={`relative pl-8 ${isLast ? "" : "pb-6"}`}>
                {/* Timeline dot */}
                <div
                  className={`absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${style.bgColor} ${style.color} ring-4 ring-white dark:ring-slate-900`}
                >
                  {step.status === "COMPLETED" ? "✓" : idx + 1}
                </div>

                {/* Step Card */}
                <Card
                  className={`p-4 transition ${
                    step.status === "LOCKED"
                      ? "opacity-60"
                      : "hover:border-indigo-400 hover:shadow-sm"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {step.problemTitle}
                        </span>
                        <DifficultyBadge difficulty={step.difficulty} />
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.bgColor} ${style.color}`}
                        >
                          {style.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>⏱ {formatEstimate(step.estimatedMinutes)}</span>
                        {step.prerequisiteTitle && (
                          <span>
                            Requires:{" "}
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {step.prerequisiteTitle}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {canNavigate ? (
                      <Link
                        href={`/problems/${step.problemSlug}`}
                        className={`inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-xs font-medium transition ${
                          step.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {step.status === "COMPLETED" ? "Review" : "Solve"}
                      </Link>
                    ) : (
                      <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                        🔒 Locked
                      </span>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
