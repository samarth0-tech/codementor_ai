"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminProblemSummary, Difficulty } from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";

interface Props {
  initialProblems: AdminProblemSummary[];
  initialMeta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function AdminProblemsView({ initialProblems, initialMeta }: Props) {
  const [problems, setProblems] = useState<AdminProblemSummary[]>(initialProblems);
  const [meta, setMeta] = useState(initialMeta);
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchProblems(params: {
    page?: number;
    search?: string;
    difficulty?: string;
    status?: string;
  }) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const q = new URLSearchParams();
      if (params.page) q.set("page", String(params.page));
      if (params.search) q.set("search", params.search);
      if (params.difficulty && params.difficulty !== "ALL") q.set("difficulty", params.difficulty);
      if (params.status && params.status !== "ALL") q.set("status", params.status);

      const res = await api.get<{
        data: AdminProblemSummary[];
        meta: { total: number; page: number; limit: number; totalPages: number };
      }>(`/admin/problems?${q.toString()}`);

      setProblems(res.data);
      setMeta(res.meta);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load problems";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    void fetchProblems({
      page: 1,
      search,
      difficulty: difficultyFilter,
      status: statusFilter,
    });
  }

  async function handleDeleteProblem(p: AdminProblemSummary) {
    const confirmMsg =
      p.submissionCount > 0
        ? `"${p.title}" has ${p.submissionCount} student submissions. Deleting it will safely archive it to preserve submission history. Continue?`
        : `Are you sure you want to permanently delete "${p.title}"?`;

    if (!window.confirm(confirmMsg)) return;

    setDeletingId(p.id);
    setErrorMsg(null);
    try {
      await api.delete(`/admin/problems/${p.id}`);
      // Refresh list
      void fetchProblems({
        page: meta.page,
        search,
        difficulty: difficultyFilter,
        status: statusFilter,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete problem";
      setErrorMsg(msg);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Action & Filter Toolbar */}
      <Card className="p-4">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              aria-label="Search problems by title or slug"
              placeholder="Search problems by title or slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <Button type="submit" variant="secondary" disabled={loading} className="text-xs">
              Search
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <label htmlFor="diff-filter" className="font-medium">
                Difficulty:
              </label>
              <select
                id="diff-filter"
                value={difficultyFilter}
                onChange={(e) => {
                  setDifficultyFilter(e.target.value);
                  void fetchProblems({
                    page: 1,
                    search,
                    difficulty: e.target.value,
                    status: statusFilter,
                  });
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Difficulties</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <label htmlFor="prob-status-filter" className="font-medium">
                Status:
              </label>
              <select
                id="prob-status-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  void fetchProblems({
                    page: 1,
                    search,
                    difficulty: difficultyFilter,
                    status: e.target.value,
                  });
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            <ButtonLink href="/admin/problems/new" variant="primary" className="text-xs py-1 px-3">
              + New Problem
            </ButtonLink>
          </div>
        </form>
      </Card>

      {/* Error Message */}
      {errorMsg && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Problems Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <tr>
                <th className="p-4 font-semibold">Problem</th>
                <th className="p-4 font-semibold">Difficulty</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Topics</th>
                <th className="p-4 font-semibold">Test Cases</th>
                <th className="p-4 font-semibold">Usage</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {problems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No problems found matching criteria.
                  </td>
                </tr>
              ) : (
                problems.map((p) => {
                  const isDeleting = deletingId === p.id;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                    >
                      <td className="p-4">
                        <Link
                          href={`/admin/problems/${p.id}/edit`}
                          className="font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                        >
                          {p.title}
                        </Link>
                        <div className="text-xs text-slate-500 font-mono">{p.slug}</div>
                      </td>
                      <td className="p-4">
                        <DifficultyBadge difficulty={p.difficulty as Difficulty} />
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            p.status === "PUBLISHED"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : p.status === "DRAFT"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {p.topics.length > 0 ? (
                            p.topics.map((t) => (
                              <span
                                key={t.slug}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              >
                                {t.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold">{p.testCaseCount} total</span>
                        <div className="text-[11px] text-slate-400">
                          {p.sampleTestCaseCount} sample
                        </div>
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        {p.submissionCount} submissions
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {p.status === "PUBLISHED" && (
                            <Link
                              href={`/problems/${p.slug}`}
                              target="_blank"
                              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1"
                            >
                              View ↗
                            </Link>
                          )}
                          <ButtonLink
                            href={`/admin/problems/${p.id}/edit`}
                            variant="secondary"
                            className="text-xs py-1 px-2.5 h-auto"
                          >
                            Edit
                          </ButtonLink>
                          <Button
                            variant="danger"
                            disabled={isDeleting}
                            onClick={() => void handleDeleteProblem(p)}
                            className="text-xs py-1 px-2.5 h-auto"
                          >
                            {p.submissionCount > 0 ? "Archive" : "Delete"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 p-4 dark:border-slate-800 text-xs text-slate-500">
            <div>
              Showing page <span className="font-semibold">{meta.page}</span> of{" "}
              <span className="font-semibold">{meta.totalPages}</span> ({meta.total} problems)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={meta.page <= 1 || loading}
                onClick={() =>
                  void fetchProblems({
                    page: meta.page - 1,
                    search,
                    difficulty: difficultyFilter,
                    status: statusFilter,
                  })
                }
                className="text-xs py-1 px-3 h-auto"
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={meta.page >= meta.totalPages || loading}
                onClick={() =>
                  void fetchProblems({
                    page: meta.page + 1,
                    search,
                    difficulty: difficultyFilter,
                    status: statusFilter,
                  })
                }
                className="text-xs py-1 px-3 h-auto"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
