import type { Metadata } from "next";
import Link from "next/link";
import type { PlatformStats } from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { serverGet } from "@/lib/server/api";

export const metadata: Metadata = { title: "Admin Overview" };

export default async function AdminOverviewPage() {
  const stats = await serverGet<PlatformStats>("/admin/stats");

  return (
    <div className="space-y-8 pb-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:flex-row sm:items-center sm:justify-between border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-400">
              Admin Portal
            </span>
            <span className="text-xs text-slate-400">Phase 17</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Platform Analytics & Governance
          </h1>
          <p className="text-sm text-slate-300">
            Real-time platform metrics, user access management, and AI usage insights.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/admin/problems" variant="primary" className="text-xs sm:text-sm">
            Manage Problems
          </ButtonLink>
          <ButtonLink href="/admin/users" variant="secondary" className="text-xs sm:text-sm">
            Manage Users
          </ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary" className="text-xs sm:text-sm">
            Back to App
          </ButtonLink>
        </div>
      </div>

      {/* Top Stat Cards: Users & AI usage */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Users */}
        <Card className="flex flex-col justify-between space-y-2 p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Users
          </span>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.users.total}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {stats.users.active} active
              </span>
              <span>•</span>
              <span className="text-rose-600 dark:text-rose-400 font-medium">
                {stats.users.suspended} suspended
              </span>
            </div>
          </div>
          <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
            +{stats.users.registeredToday} today • +{stats.users.registeredThisWeek} this week
          </div>
        </Card>

        {/* Interviews */}
        <Card className="flex flex-col justify-between space-y-2 p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            AI Interviews
          </span>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.interviews.total}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {stats.interviews.completed} completed
              </span>
              <span>•</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {stats.interviews.inProgress} in progress
              </span>
            </div>
          </div>
          <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
            Average score:{" "}
            {stats.interviews.averageScore !== null ? `${stats.interviews.averageScore}%` : "N/A"}
          </div>
        </Card>

        {/* Submissions */}
        <Card className="flex flex-col justify-between space-y-2 p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Submissions & Executions
          </span>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.submissions.total}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {stats.submissions.accepted} accepted
              </span>
              <span>•</span>
              <span className="font-medium text-slate-600 dark:text-slate-400">
                {stats.submissions.acceptanceRate}% pass rate
              </span>
            </div>
          </div>
          <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
            Sandboxed execution via Piston
          </div>
        </Card>

        {/* AI Calls & Token Traffic */}
        <Card className="flex flex-col justify-between space-y-2 p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            AI Telemetry
          </span>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.aiCalls.total}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-purple-600 dark:text-purple-400">
                {stats.aiCalls.today} calls today
              </span>
            </div>
          </div>
          <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
            Code reviews generated: {stats.reviews.total}
          </div>
        </Card>
      </div>

      {/* Breakdown Grids */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* User Breakdown */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              User Role Distribution
            </h2>
            <Link
              href="/admin/users"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              View directory &rarr;
            </Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Students</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {stats.users.students}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full bg-indigo-600"
                style={{
                  width: `${stats.users.total > 0 ? (stats.users.students / stats.users.total) * 100 : 0}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-sm pt-2">
              <span className="text-slate-600 dark:text-slate-400">Administrators</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {stats.users.admins}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full bg-purple-600"
                style={{
                  width: `${stats.users.total > 0 ? (stats.users.admins / stats.users.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </Card>

        {/* Problem Library Breakdown */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Problem Catalog Status
            </h2>
            <Link
              href="/problems"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              Browse catalog &rarr;
            </Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Published Problems</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {stats.problems.published}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Drafts</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {stats.problems.draft}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Archived</span>
              <span className="font-semibold text-slate-400">{stats.problems.archived}</span>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs text-slate-500">
              <span>Total Problem Bank</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {stats.problems.total}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
