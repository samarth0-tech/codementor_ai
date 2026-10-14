import type { Metadata } from "next";
import Link from "next/link";
import {
  DIFFICULTIES,
  problemListQuerySchema,
  type Paginated,
  type ProblemSummary,
  type TopicDto,
} from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { DifficultyBadge, TopicTag } from "@/components/ui/badge";
import { serverGet } from "@/lib/server/api";

export const metadata: Metadata = { title: "Problems" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const field =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";

export default async function ProblemsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  // Never trust the URL: validate it with the same schema the API uses; fall back to defaults.
  const parsed = problemListQuerySchema.safeParse({
    topic: first(raw.topic),
    difficulty: first(raw.difficulty),
    q: first(raw.q),
    page: first(raw.page),
    limit: 12,
  });
  const query = parsed.success ? parsed.data : problemListQuerySchema.parse({ limit: 12 });

  const qs = new URLSearchParams();
  if (query.topic) qs.set("topic", query.topic);
  if (query.difficulty) qs.set("difficulty", query.difficulty);
  if (query.q) qs.set("q", query.q);
  const base = qs.toString();
  const apiQuery = new URLSearchParams(base);
  apiQuery.set("page", String(query.page));
  apiQuery.set("limit", String(query.limit));

  const [list, { topics }] = await Promise.all([
    serverGet<Paginated<ProblemSummary>>(`/problems?${apiQuery}`),
    serverGet<{ topics: TopicDto[] }>("/topics"),
  ]);

  const pages = Math.max(1, Math.ceil(list.meta.total / list.meta.limit));
  const pageHref = (page: number) => `/problems?${base ? `${base}&` : ""}page=${page}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Problems</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {list.meta.total} problem{list.meta.total === 1 ? "" : "s"}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <input
          name="q"
          defaultValue={query.q}
          placeholder="Search by title"
          aria-label="Search by title"
          className={`${field} w-56`}
        />
        <select
          name="difficulty"
          defaultValue={query.difficulty ?? ""}
          aria-label="Difficulty"
          className={field}
        >
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select name="topic" defaultValue={query.topic ?? ""} aria-label="Topic" className={field}>
          <option value="">Any topic</option>
          {topics.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
        <Button type="submit">Filter</Button>
        {base ? (
          <ButtonLink href="/problems" variant="ghost">
            Clear
          </ButtonLink>
        ) : null}
      </form>

      {list.data.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No problems match your filters.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.data.map((p) => (
            <li key={p.id}>
              <Link href={`/problems/${p.slug}`} className="block">
                <Card className="h-full transition hover:border-indigo-400">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{p.title}</h2>
                    <DifficultyBadge difficulty={p.difficulty} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.topics.map((t) => (
                      <TopicTag key={t.slug}>{t.name}</TopicTag>
                    ))}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          {query.page > 1 ? (
            <ButtonLink href={pageHref(query.page - 1)} variant="secondary">
              Previous
            </ButtonLink>
          ) : (
            <span />
          )}
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Page {query.page} of {pages}
          </span>
          {query.page < pages ? (
            <ButtonLink href={pageHref(query.page + 1)} variant="secondary">
              Next
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
