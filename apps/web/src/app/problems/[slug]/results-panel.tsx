import { isTerminalStatus, type SubmissionDetail } from "@codementor/shared";
import {
  TONE_CLASS,
  VERDICT_LABEL,
  formatMemory,
  formatTime,
  verdictTone,
} from "@/lib/submission-ui";

const pre = "overflow-x-auto rounded-md bg-slate-100 p-2 font-mono text-xs dark:bg-slate-900";

export function ResultsPanel({
  submission,
  starting,
}: {
  submission: SubmissionDetail | undefined;
  /** true while the submission request itself is being sent */
  starting: boolean;
}) {
  if (starting || (submission && !isTerminalStatus(submission.status))) {
    return (
      <p className="p-4 text-sm text-slate-600 dark:text-slate-300" role="status">
        {submission?.status === "RUNNING" ? "Running your code..." : "Sending your code..."}
      </p>
    );
  }
  if (!submission) {
    return (
      <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
        Run your code against the examples, or submit it to be judged on every test. Shortcut:
        Ctrl/Cmd + Enter runs the examples.
      </p>
    );
  }

  const tone = verdictTone(submission.verdict);
  return (
    <div className="space-y-3 p-4">
      {submission.executor === "mock" ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Simulated result: your code was not actually executed. Real execution (Judge0) arrives in
          the next phase.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${TONE_CLASS[tone]}`}>
          {submission.status === "FAILED" || submission.verdict === null
            ? VERDICT_LABEL.INTERNAL_ERROR
            : VERDICT_LABEL[submission.verdict]}
        </span>
        <span className="text-sm">
          {submission.passedCount}/{submission.totalCount} tests passed
          <span className="text-slate-500 dark:text-slate-400">
            {" "}
            ({submission.mode === "RUN" ? "examples only" : "all tests"})
          </span>
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatTime(submission.maxTimeMs)} &middot; {formatMemory(submission.maxMemoryKb)}
        </span>
      </div>

      {submission.status === "FAILED" || submission.verdict === "INTERNAL_ERROR" ? (
        <p className="text-sm" role="alert">
          {submission.errorMessage ??
            "Something went wrong on our side while running your code. This is not a problem with your solution; please try again."}
        </p>
      ) : null}

      {submission.compileOutput ? <pre className={pre}>{submission.compileOutput}</pre> : null}

      <ul className="space-y-2">
        {submission.results.map((r) => (
          <li
            key={r.index}
            className="rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700"
          >
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span aria-hidden>{r.passed ? "✅" : "❌"}</span>
                <span className="font-medium">
                  {r.isSample ? `Example ${r.index}` : `Hidden test ${r.index}`}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {VERDICT_LABEL[r.verdict]}
                </span>
                <span className="ml-auto text-xs text-slate-500">
                  {formatTime(r.timeMs)} &middot; {formatMemory(r.memoryKb)}
                </span>
              </summary>
              {r.isSample ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Input</p>
                    <pre className={pre}>{r.input}</pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Expected</p>
                    <pre className={pre}>{r.expectedOutput}</pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Your output</p>
                    <pre className={pre}>{r.stdout ?? ""}</pre>
                    {r.stderr ? (
                      <pre className={`${pre} mt-1 text-red-700 dark:text-red-300`}>{r.stderr}</pre>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Hidden test: its input and expected output are not shown.
                </p>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
