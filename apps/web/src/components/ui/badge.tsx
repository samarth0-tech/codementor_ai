import type { Difficulty } from "@codementor/shared";

const styles: Record<Difficulty, string> = {
  EASY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  HARD: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const labels: Record<Difficulty, string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[difficulty]}`}>
      {labels[difficulty]}
    </span>
  );
}

export function TopicTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      {children}
    </span>
  );
}
