import type { Metadata } from "next";
import type { AdminProblemListResponse } from "@codementor/shared";
import { serverGet } from "@/lib/server/api";
import { ButtonLink } from "@/components/ui/button";
import { AdminProblemsView } from "./admin-problems-view";

export const metadata: Metadata = { title: "Manage Problems - Admin" };

export default async function AdminProblemsPage() {
  const list = await serverGet<AdminProblemListResponse>("/admin/problems?limit=20");

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Problem Bank & Content Authoring
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create, edit, organize, and publish coding challenges with custom test suites and
            starter code.
          </p>
        </div>
        <ButtonLink href="/admin" variant="secondary" className="text-xs">
          &larr; Admin Overview
        </ButtonLink>
      </div>

      <AdminProblemsView initialProblems={list.data} initialMeta={list.meta} />
    </div>
  );
}
