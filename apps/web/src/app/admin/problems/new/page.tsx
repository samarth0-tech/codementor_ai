import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { ProblemForm } from "../problem-form";

export const metadata: Metadata = { title: "New Problem - Admin" };

export default function NewProblemPage() {
  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Create Coding Problem
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Define requirements, starter code templates, and test cases for student practice and
            mock interviews.
          </p>
        </div>
        <ButtonLink href="/admin/problems" variant="secondary" className="text-xs">
          &larr; Problem Bank
        </ButtonLink>
      </div>

      <ProblemForm />
    </div>
  );
}
