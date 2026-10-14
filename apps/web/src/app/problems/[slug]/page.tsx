import type { Metadata } from "next";
import Link from "next/link";
import type { LanguageDto, Paginated, ProblemDetail, SubmissionSummary } from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { DifficultyBadge, TopicTag } from "@/components/ui/badge";
import { serverGet } from "@/lib/server/api";
import { ProblemWorkspace } from "./problem-workspace";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

const pre = "overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-sm dark:bg-slate-900";

function Statement({ problem }: { problem: ProblemDetail }) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{problem.title}</h1>
          <DifficultyBadge difficulty={problem.difficulty} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {problem.topics.map((t) => (
            <TopicTag key={t.slug}>{t.name}</TopicTag>
          ))}
        </div>
      </div>

      <Card className="space-y-6">
        {/* Plain text (not HTML/markdown) on purpose: nothing a problem author writes can inject markup. */}
        <p className="whitespace-pre-wrap leading-relaxed">{problem.description}</p>
        <Section title="Input">
          <p className="whitespace-pre-wrap text-sm">{problem.inputFormat}</p>
        </Section>
        <Section title="Output">
          <p className="whitespace-pre-wrap text-sm">{problem.outputFormat}</p>
        </Section>
        <Section title="Constraints">
          <p className="whitespace-pre-wrap text-sm">{problem.constraints}</p>
        </Section>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Time limit {problem.timeLimitMs / 1000}s &middot; Memory limit{" "}
          {Math.round(problem.memoryLimitKb / 1024)} MB
        </p>
      </Card>

      {problem.samples.map((sample, i) => (
        <Card key={i} className="space-y-3">
          <h2 className="font-semibold">Example {i + 1}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Input</p>
              <pre className={pre}>{sample.input}</pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Output</p>
              <pre className={pre}>{sample.expectedOutput}</pre>
            </div>
          </div>
          {sample.explanation ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">{sample.explanation}</p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

export default async function ProblemPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [{ problem }, { languages }, submissions] = await Promise.all([
    serverGet<{ problem: ProblemDetail }>(`/problems/${slug}`),
    serverGet<{ languages: LanguageDto[] }>("/languages"),
    serverGet<Paginated<SubmissionSummary>>(`/submissions?problem=${slug}&limit=10`),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/problems" className="text-sm text-indigo-600 hover:underline">
        &larr; All problems
      </Link>
      <ProblemWorkspace
        problem={problem}
        languages={languages}
        initialSubmissions={submissions}
        statement={<Statement problem={problem} />}
      />
    </div>
  );
}
