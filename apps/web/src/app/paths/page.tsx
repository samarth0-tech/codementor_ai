import type { Metadata } from "next";
import Link from "next/link";
import type { LearningPathSummaryDto } from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { DifficultyBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { serverGet } from "@/lib/server/api";

export const metadata: Metadata = { title: "Learning Paths" };

export default async function PathsPage() {
  const paths = await serverGet<LearningPathSummaryDto[]>("/paths");

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          Learning Paths
        </h1>
        <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Follow structured learning paths to build your skills step-by-step. Complete problems in
          order to unlock the next challenge.
        </p>
      </div>

      {/* Path Grid */}
      {paths.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {paths.map((path) => (
            <Link key={path.slug} href={`/paths/${path.slug}`} className="block">
              <Card className="flex h-full flex-col justify-between gap-4 p-5 transition hover:border-indigo-400 hover:shadow-md">
                {/* Top */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-slate-900 dark:text-white">{path.title}</h2>
                    <DifficultyBadge difficulty={path.difficulty} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{path.description}</p>
                  <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {path.category}
                  </span>
                </div>

                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {path.completedProblems} / {path.totalProblems} completed
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
                  {path.nextProblemSlug && path.completedProblems < path.totalProblems ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Next up:{" "}
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {path.nextProblemSlug.replace(/-/g, " ")}
                      </span>
                    </p>
                  ) : path.completedProblems === path.totalProblems && path.totalProblems > 0 ? (
                    <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      ✓ Path completed!
                    </p>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center space-y-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            📚
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white">No learning paths yet</h3>
          <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
            Learning paths will appear here once content is configured.
          </p>
          <ButtonLink href="/problems" className="mt-2 text-xs">
            Browse Problems
          </ButtonLink>
        </Card>
      )}
    </div>
  );
}
