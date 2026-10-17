"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isTerminalStatus,
  type Language,
  type LanguageDto,
  type Paginated,
  type ProblemDetail,
  type SubmissionDetail,
  type SubmissionMode,
  type SubmissionSummary,
} from "@codementor/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { drafts } from "@/lib/drafts";
import { decodeCode, encodeCode, pollIntervalMs } from "@/lib/submission-ui";
import { useDraft } from "@/lib/use-draft";
import {
  elapsedMs,
  formatElapsed,
  isRunning,
  parseTimer,
  serializeTimer,
  startTimer,
  stopTimer,
} from "@/lib/workspace-timer";
import { CodeEditor } from "./code-editor";
import { ResultsPanel } from "./results-panel";
import { ReviewPanel } from "./review-panel";
import { SubmissionHistory } from "./submission-history";

interface Props {
  problem: ProblemDetail;
  languages: LanguageDto[];
  initialSubmissions: Paginated<SubmissionSummary>;
  /** The problem statement, rendered on the server and passed in. */
  statement: React.ReactNode;
}

function Stopwatch({ rawTimer, onReset }: { rawTimer: string; onReset: () => void }) {
  const timer = parseTimer(rawTimer);
  const [now, setNow] = useState(() => Date.now());
  const running = isRunning(timer);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="font-mono" aria-label="Time spent">
        {formatElapsed(elapsedMs(timer, now))}
      </span>
      <span className="text-xs text-slate-500">
        {timer.startedAt === null ? "starts when you type" : running ? "running" : "stopped"}
      </span>
      {timer.startedAt !== null ? (
        <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={onReset}>
          reset
        </button>
      ) : null}
    </span>
  );
}

export function ProblemWorkspace({ problem, languages, initialSubmissions, statement }: Props) {
  const queryClient = useQueryClient();
  const slug = problem.slug;

  // ---- language and code (both remembered in the browser) ----
  const [savedLanguage, setSavedLanguage] = useDraft(`lang:${slug}`);
  const language: Language | undefined =
    languages.find((l) => l.language === savedLanguage)?.language ??
    languages.find((l) => l.language === "PYTHON")?.language ??
    languages[0]?.language;
  const [rawCode, setRawCode] = useDraft(`code:${slug}:${language}`);
  const [rawTimer, setRawTimer] = useDraft(`timer:${slug}`);

  const [tab, setTab] = useState<"problem" | "submissions">("problem");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // ---- submissions: create (202) then poll until finished ----
  const create = useMutation({
    mutationFn: (mode: SubmissionMode) =>
      api.post<{ submission: SubmissionDetail }>("/submissions", {
        problem: slug,
        language,
        sourceCode: decodeCode(rawCode) ?? problem.starterCode[language as Language] ?? "",
        mode,
      }),
    onSuccess: ({ submission }) => {
      queryClient.setQueryData(["submission", submission.id], submission);
      setActiveId(submission.id);
    },
  });

  const active = useQuery({
    queryKey: ["submission", activeId],
    enabled: activeId !== null,
    queryFn: async () =>
      (await api.get<{ submission: SubmissionDetail }>(`/submissions/${activeId}`)).submission,
    refetchInterval: (q) => pollIntervalMs(q.state.data?.status),
  });
  const history = useQuery({
    queryKey: ["submissions", slug],
    queryFn: () => api.get<Paginated<SubmissionSummary>>(`/submissions?problem=${slug}&limit=10`),
    initialData: initialSubmissions,
  });

  const finished = active.data && isTerminalStatus(active.data.status) ? active.data : null;
  const finishedId = finished?.id ?? null;
  const solvedId =
    finished?.mode === "SUBMIT" && finished.verdict === "ACCEPTED" ? finished.id : null;

  useEffect(() => {
    if (finishedId) void queryClient.invalidateQueries({ queryKey: ["submissions", slug] });
  }, [finishedId, slug, queryClient]);

  useEffect(() => {
    // Stop the stopwatch when the full submission is accepted. Read the freshest saved value.
    if (!solvedId) return;
    const current = parseTimer(drafts.get(`timer:${slug}`) ?? "");
    setRawTimer(serializeTimer(stopTimer(current, Date.now())));
  }, [solvedId, slug, setRawTimer]);

  if (!language) {
    return <Alert tone="error">No programming languages are available right now.</Alert>;
  }

  const starter = problem.starterCode[language] ?? "";
  const code = decodeCode(rawCode) ?? starter;
  const config = languages.find((l) => l.language === language) as LanguageDto;
  const inFlight =
    create.isPending || (active.data !== undefined && !isTerminalStatus(active.data.status));

  function edit(next: string) {
    setRawCode(encodeCode(next));
    const timer = parseTimer(rawTimer);
    if (timer.startedAt === null) setRawTimer(serializeTimer(startTimer(timer, Date.now())));
  }

  function run(mode: SubmissionMode) {
    if (!inFlight && code.trim().length > 0) create.mutate(mode);
  }

  async function loadSubmission(id: string) {
    setLoadingId(id);
    try {
      const { submission } = await api.get<{ submission: SubmissionDetail }>(`/submissions/${id}`);
      // Save the code under ITS language first, then switch: the editor re-reads the draft.
      drafts.set(`code:${slug}:${submission.language}`, encodeCode(submission.sourceCode));
      setSavedLanguage(submission.language);
      setTab("problem");
    } finally {
      setLoadingId(null);
    }
  }

  const tabClass = (name: string) =>
    `px-4 py-2 text-sm font-medium ${
      tab === name
        ? "border-b-2 border-indigo-600 text-indigo-600"
        : "text-slate-600 hover:text-slate-900 dark:text-slate-300"
    }`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <div role="tablist" className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            role="tab"
            aria-selected={tab === "problem"}
            className={tabClass("problem")}
            onClick={() => setTab("problem")}
          >
            Problem
          </button>
          <button
            role="tab"
            aria-selected={tab === "submissions"}
            className={tabClass("submissions")}
            onClick={() => setTab("submissions")}
          >
            Submissions ({history.data.meta.total})
          </button>
        </div>
        {tab === "problem" ? (
          statement
        ) : (
          <Card className="p-0">
            <SubmissionHistory
              submissions={history.data.data}
              onLoad={loadSubmission}
              loadingId={loadingId}
            />
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <Card className="space-y-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              aria-label="Language"
              value={language}
              onChange={(e) => setSavedLanguage(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              {languages.map((l) => (
                <option key={l.language} value={l.language}>
                  {l.displayName}
                </option>
              ))}
            </select>
            <Stopwatch rawTimer={rawTimer} onReset={() => setRawTimer("")} />
            <button
              type="button"
              className="text-xs text-slate-600 hover:underline dark:text-slate-300"
              onClick={() => {
                if (window.confirm("Reset your code to the starter template?")) setRawCode("");
              }}
            >
              Reset code
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <CodeEditor
              key={language}
              value={code}
              onChange={edit}
              monacoLanguage={config.monacoId}
              onRun={() => run("RUN")}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={inFlight} onClick={() => run("RUN")}>
              Run examples
            </Button>
            <Button disabled={inFlight} onClick={() => run("SUBMIT")}>
              Submit
            </Button>
          </div>
        </Card>

        {create.isError ? (
          <Alert tone="error">
            {create.error instanceof ApiError ? create.error.message : "Could not send your code."}
          </Alert>
        ) : null}
        {active.isError ? (
          <Alert tone="error">Could not load the result. Please try again.</Alert>
        ) : null}

        <Card className="p-0">
          <ResultsPanel submission={active.data} starting={create.isPending} />
        </Card>

        {/* After a submission finishes: ask the AI to review the code (Phase 10). */}
        <ReviewPanel submission={active.data} />
      </div>
    </div>
  );
}
