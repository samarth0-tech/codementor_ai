import type { Metadata } from "next";
import Link from "next/link";
import type { InterviewSummary, Paginated } from "@codementor/shared";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DifficultyBadge } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/lib/interview-ui";
import { serverGet } from "@/lib/server/api";

export const metadata: Metadata = { title: "Interviews" };

export default async function InterviewsPage() {
  const { data, meta } = await serverGet<Paginated<InterviewSummary>>("/interviews?limit=20");
  const active = data.find((i) => i.status === "IN_PROGRESS");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI interviews</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {meta.total} interview{meta.total === 1 ? "" : "s"} so far
          </p>
        </div>
        {active ? (
          <ButtonLink href={`/interviews/${active.id}`}>Continue your interview</ButtonLink>
        ) : (
          <ButtonLink href="/interviews/new">Start a new interview</ButtonLink>
        )}
      </div>

      {data.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You have not taken an interview yet. Pick a topic and an AI interviewer will ask you
            questions, adapt to your answers and score you at the end.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.map((i) => (
            <li key={i.id}>
              <Link href={`/interviews/${i.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-3 transition hover:border-indigo-400">
                  <div className="space-y-1">
                    <p className="font-semibold">{i.topic}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(i.startedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}{" "}
                      &middot; {i.answeredCount} answered
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <DifficultyBadge difficulty={i.difficulty} />
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {STATUS_LABEL[i.status]}
                    </span>
                    {i.overallScore !== null ? (
                      <span className="text-lg font-semibold">{Math.round(i.overallScore)}</span>
                    ) : null}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
