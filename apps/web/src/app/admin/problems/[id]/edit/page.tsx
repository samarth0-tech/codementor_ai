import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AdminProblemDetail } from "@codementor/shared";
import { serverGet } from "@/lib/server/api";
import { ButtonLink } from "@/components/ui/button";
import { ProblemForm } from "../../problem-form";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Edit Problem - Admin" };

export default async function EditProblemPage({ params }: Props) {
  const { id } = await params;

  let problem: AdminProblemDetail;
  try {
    const res = await serverGet<{ problem: AdminProblemDetail }>(`/admin/problems/${id}`);
    problem = res.problem;
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Edit &quot;{problem.title}&quot;
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Update problem requirements, test suite, and publication status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {problem.status === "PUBLISHED" && (
            <ButtonLink
              href={`/problems/${problem.slug}`}
              target="_blank"
              variant="secondary"
              className="text-xs"
            >
              Preview in Workspace ↗
            </ButtonLink>
          )}
          <ButtonLink href="/admin/problems" variant="secondary" className="text-xs">
            &larr; Problem Bank
          </ButtonLink>
        </div>
      </div>

      <ProblemForm initialProblem={problem} />
    </div>
  );
}
