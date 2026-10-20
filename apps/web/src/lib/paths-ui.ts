import type { StepStatus } from "@codementor/shared";

export interface StepStyle {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}

const stepStyles: Record<StepStatus, StepStyle> = {
  COMPLETED: {
    label: "Completed",
    color: "text-emerald-700 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-950",
    icon: "✓",
  },
  CURRENT: {
    label: "Start",
    color: "text-indigo-700 dark:text-indigo-400",
    bgColor: "bg-indigo-100 dark:bg-indigo-950",
    icon: "→",
  },
  LOCKED: {
    label: "Locked",
    color: "text-slate-500 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-800",
    icon: "🔒",
  },
};

export function getStepStyle(status: StepStatus): StepStyle {
  return stepStyles[status];
}

export function formatEstimate(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}
