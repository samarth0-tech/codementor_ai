import { ButtonLink } from "@/components/ui/button";

export default function Home() {
  return (
    <section className="mx-auto max-w-2xl space-y-6 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Practice coding interviews with an AI interviewer
      </h1>
      <p className="text-lg text-slate-600 dark:text-slate-300">
        Adaptive follow-up questions, a real code editor with sandboxed execution, instant AI code
        review, and analytics that show exactly what to study next.
      </p>
      <div className="flex justify-center gap-3">
        <ButtonLink href="/register">Create free account</ButtonLink>
        <ButtonLink href="/login" variant="secondary">
          Sign in
        </ButtonLink>
      </div>
    </section>
  );
}
