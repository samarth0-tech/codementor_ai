import type { Metadata } from "next";
import Link from "next/link";
import type {
  DashboardMetricsDto,
  InterviewSummary,
  Paginated,
  ProblemSummary,
  PublicUser,
} from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/badge";
import { serverGet } from "@/lib/server/api";
import { calculateProgress, formatActivityDate } from "@/lib/dashboard-ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // Fetch user, problems, interviews, and comprehensive dashboard metrics in parallel.
  const [{ user }, suggested, interviews, metrics] = await Promise.all([
    serverGet<{ user: PublicUser }>("/auth/me"),
    serverGet<Paginated<ProblemSummary>>("/problems?limit=4"),
    serverGet<Paginated<InterviewSummary>>("/interviews?limit=3"),
    serverGet<DashboardMetricsDto>("/dashboard/metrics"),
  ]);

  const active = interviews.data.find((i) => i.status === "IN_PROGRESS");
  const {
    problems,
    submissions,
    interviews: interviewStats,
    reviews,
    resume,
    recentActivity,
  } = metrics;

  const problemProgress = calculateProgress(problems.solved, problems.totalAvailable);

  return (
    <div className="space-y-8 pb-8">
      {/* Welcome Banner */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-slate-900/40 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Welcome back, {user.name}
          </h1>
          <p className="text-sm text-slate-300">
            Track your coding practice, AI mock interviews, and code review feedback in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/problems" variant="secondary" className="text-xs sm:text-sm">
            Browse Problems
          </ButtonLink>
          <ButtonLink
            href={active ? `/interviews/${active.id}` : "/interviews/new"}
            className="text-xs sm:text-sm"
          >
            {active ? "Resume Interview" : "New Interview"}
          </ButtonLink>
        </div>
      </div>

      {/* Top Stat Cards (4-column grid) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Stat 1: Problems Solved */}
        <Card className="flex flex-col justify-between space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Problems Solved
            </span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {problems.solved} / {problems.totalAvailable}
            </span>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {problems.solved}
              </span>
              <span className="text-xs text-slate-500">({problemProgress}% solved)</span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                style={{ width: `${problemProgress}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 pt-1 text-center text-xs">
            <div className="rounded bg-emerald-50 py-1 dark:bg-emerald-950/40">
              <span className="block font-bold text-emerald-700 dark:text-emerald-400">
                {problems.byDifficulty.easy.solved}/{problems.byDifficulty.easy.total}
              </span>
              <span className="text-[10px] text-slate-500">Easy</span>
            </div>
            <div className="rounded bg-amber-50 py-1 dark:bg-amber-950/40">
              <span className="block font-bold text-amber-700 dark:text-amber-400">
                {problems.byDifficulty.medium.solved}/{problems.byDifficulty.medium.total}
              </span>
              <span className="text-[10px] text-slate-500">Medium</span>
            </div>
            <div className="rounded bg-red-50 py-1 dark:bg-red-950/40">
              <span className="block font-bold text-red-700 dark:text-red-400">
                {problems.byDifficulty.hard.solved}/{problems.byDifficulty.hard.total}
              </span>
              <span className="text-[10px] text-slate-500">Hard</span>
            </div>
          </div>
        </Card>

        {/* Stat 2: Acceptance Rate */}
        <Card className="flex flex-col justify-between space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Acceptance Rate
            </span>
            <span className="text-xs text-slate-500">{submissions.total} total runs</span>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {submissions.acceptanceRate}%
              </span>
              <span className="text-xs text-slate-500">{submissions.accepted} accepted</span>
            </div>
            {/* Visual breakdown bar */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${submissions.acceptanceRate}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {submissions.total > 0
              ? `${submissions.accepted} of ${submissions.total} submissions passed all test cases.`
              : "No submissions yet. Submit code to establish your rate."}
          </p>
        </Card>

        {/* Stat 3: AI Mock Interviews */}
        <Card className="flex flex-col justify-between space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              AI Interviews
            </span>
            {active ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                Active Now
              </span>
            ) : (
              <span className="text-xs text-slate-500">{interviewStats.completed} completed</span>
            )}
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {interviewStats.averageScore !== null
                  ? `${Math.round(interviewStats.averageScore)}%`
                  : "—"}
              </span>
              <span className="text-xs text-slate-500">
                {interviewStats.averageScore !== null ? "avg score" : "no scores yet"}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-purple-600 transition-all duration-500"
                style={{ width: `${interviewStats.averageScore ?? 0}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {active
              ? `In-progress: "${active.topic}". Resume to finish.`
              : interviewStats.latest
                ? `Latest: "${interviewStats.latest.topic}" (${interviewStats.latest.overallScore !== null ? `${Math.round(interviewStats.latest.overallScore)}%` : "pending"}).`
                : "Practice system design, DSA, and resume-based questions."}
          </p>
        </Card>

        {/* Stat 4: AI Code Reviews */}
        <Card className="flex flex-col justify-between space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Code Reviews
            </span>
            <span className="text-xs text-slate-500">{reviews.total} reviews</span>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {reviews.averageScore !== null ? `${Math.round(reviews.averageScore)}` : "—"}
              </span>
              <span className="text-xs text-slate-500">
                {reviews.averageScore !== null ? "/ 100 quality" : "no reviews yet"}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-cyan-600 transition-all duration-500"
                style={{ width: `${reviews.averageScore ?? 0}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {reviews.latest
              ? `Latest on "${reviews.latest.problemTitle}": ${Math.round(reviews.latest.overallScore)}/100.`
              : "Submit a solution to receive automated AI feedback on correctness & complexity."}
          </p>
        </Card>
      </section>

      {/* Middle Grid: Recent Activity & Quick Action Cards */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Recent Activity Feed (2 cols wide) */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Activity</h2>
            <span className="text-xs text-slate-500">
              Showing last {recentActivity.length} events
            </span>
          </div>

          {recentActivity.length > 0 ? (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-700/60 dark:border-slate-700 dark:bg-slate-800/60">
              {recentActivity.map((item) => (
                <Link
                  key={item.id}
                  href={item.link}
                  className="flex items-center justify-between p-4 transition hover:bg-slate-50 dark:hover:bg-slate-700/40"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    {item.badge ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          item.badge.variant === "success"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : item.badge.variant === "warning"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : item.badge.variant === "danger"
                                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {item.badge.text}
                      </span>
                    ) : null}
                    <span className="text-xs text-slate-400">
                      {formatActivityDate(item.timestamp)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                ⚡
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white">No activity yet</h3>
              <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
                Your submissions, AI interviews, and code reviews will show up here as you practice.
              </p>
              <ButtonLink href="/problems" className="mt-2 text-xs">
                Solve Your First Problem
              </ButtonLink>
            </Card>
          )}
        </div>

        {/* Right Column: Resume Card & Verdict Breakdown */}
        <div className="space-y-6">
          {/* Resume Profile Status Card */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Resume Profile
              </h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  resume.hasResume
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {resume.hasResume ? "Uploaded" : "Not uploaded"}
              </span>
            </div>

            {resume.hasResume && resume.latest ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  📄 {resume.latest.fileName}
                </p>
                <div className="flex gap-2 text-xs text-slate-500">
                  <span>{resume.latest.skillsCount} skills</span>
                  <span>•</span>
                  <span>{resume.latest.projectsCount} projects</span>
                </div>
                <ButtonLink
                  href="/interviews/new?tab=resume"
                  variant="primary"
                  className="w-full justify-center text-xs"
                >
                  Start Resume Interview
                </ButtonLink>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Upload your PDF or DOCX resume to enable personalized mock interviews tailored to
                  your projects.
                </p>
                <ButtonLink
                  href="/interviews/new"
                  variant="secondary"
                  className="w-full justify-center text-xs"
                >
                  Upload Resume
                </ButtonLink>
              </div>
            )}
          </Card>

          {/* Submission Verdicts Distribution */}
          <Card className="space-y-3 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Verdict Distribution
            </h3>

            {submissions.total > 0 ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Accepted
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {submissions.verdictCounts.ACCEPTED}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Wrong Answer
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {submissions.verdictCounts.WRONG_ANSWER}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 font-medium">
                    <span className="h-2 w-2 rounded-full bg-orange-500" /> Time Limit Exceeded
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {submissions.verdictCounts.TIME_LIMIT}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> Runtime Error
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {submissions.verdictCounts.RUNTIME_ERROR}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Compile Error
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {submissions.verdictCounts.COMPILE_ERROR}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No submissions recorded yet.
              </p>
            )}
          </Card>
        </div>
      </section>

      {/* Suggested Problems Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Suggested Coding Problems
          </h2>
          <ButtonLink href="/problems" variant="secondary" className="text-xs">
            Browse all {suggested.meta.total}
          </ButtonLink>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {suggested.data.map((p) => (
            <li key={p.id}>
              <Link href={`/problems/${p.slug}`} className="block">
                <Card className="flex items-center justify-between gap-3 p-4 transition hover:border-indigo-400">
                  <div className="space-y-0.5">
                    <span className="font-medium text-slate-900 dark:text-white">{p.title}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {p.topics?.map((t) => (
                        <span key={t.slug} className="text-[11px] text-slate-500">
                          #{t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <DifficultyBadge difficulty={p.difficulty} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
