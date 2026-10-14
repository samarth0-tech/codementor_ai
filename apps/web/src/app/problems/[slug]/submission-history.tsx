import type { SubmissionSummary } from "@codementor/shared";
import { TONE_CLASS, VERDICT_LABEL, verdictTone } from "@/lib/submission-ui";

export function SubmissionHistory({
  submissions,
  onLoad,
  loadingId,
}: {
  submissions: SubmissionSummary[];
  onLoad: (id: string) => void;
  loadingId: string | null;
}) {
  if (submissions.length === 0) {
    return <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No submissions yet.</p>;
  }
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
      {submissions.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[verdictTone(s.verdict)]}`}
          >
            {s.verdict ? VERDICT_LABEL[s.verdict] : s.status === "FAILED" ? "Failed" : "Running"}
          </span>
          <span>
            {s.passedCount}/{s.totalCount}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {s.language} &middot; {s.mode === "RUN" ? "run" : "submit"} &middot;{" "}
            {new Date(s.createdAt).toLocaleString("en-GB", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
          <button
            type="button"
            className="ml-auto text-xs font-medium text-indigo-600 hover:underline disabled:opacity-60"
            disabled={loadingId !== null}
            onClick={() => onLoad(s.id)}
          >
            {loadingId === s.id ? "Loading..." : "Load this code"}
          </button>
        </li>
      ))}
    </ul>
  );
}
