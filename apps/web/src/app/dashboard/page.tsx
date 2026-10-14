import type { Metadata } from "next";
import Link from "next/link";
import type { InterviewSummary, Paginated, ProblemSummary, PublicUser } from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/badge";
import { serverGet } from "@/lib/server/api";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // Server Components skip the browser: they call Express directly with a fresh signed note.
  const [{ user }, suggested, interviews] = await Promise.all([
    serverGet<{ user: PublicUser }>("/auth/me"),
    serverGet<Paginated<ProblemSummary>>("/problems?limit=4"),
    serverGet<Paginated<InterviewSummary>>("/interviews?limit=3"),
  ]);
  const active = interviews.data.find((i) => i.status === "IN_PROGRESS");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Practice problems now; AI interviews and analytics are being added next.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">AI interviews</h2>
          <ButtonLink href={active ? `/interviews/${active.id}` : "/interviews/new"}>
            {active ? "Continue your interview" : "Start an interview"}
          </ButtonLink>
        </div>
        {interviews.data.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-3">
            {interviews.data.map((i) => (
              <li key={i.id}>
                <Link href={`/interviews/${i.id}`} className="block">
                  <Card className="space-y-1 transition hover:border-indigo-400">
                    <p className="font-medium">{i.topic}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {i.overallScore !== null
                        ? `Score ${Math.round(i.overallScore)}`
                        : "Not scored"}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Start practicing</h2>
          <ButtonLink href="/problems" variant="secondary">
            Browse all {suggested.meta.total}
          </ButtonLink>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {suggested.data.map((p) => (
            <li key={p.id}>
              <Link href={`/problems/${p.slug}`} className="block">
                <Card className="flex items-center justify-between gap-3 transition hover:border-indigo-400">
                  <span className="font-medium">{p.title}</span>
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
