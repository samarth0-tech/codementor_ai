import type { ReportDto } from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { RubricPanel } from "@/components/rubric-panel";
import { TONE_BAR, scoreTone } from "@/lib/interview-ui";

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{Math.round(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-2 rounded-full ${TONE_BAR[scoreTone(value)]}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ReportView({ report }: { report: ReportDto }) {
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Overall score</p>
          <p className="text-4xl font-bold">
            {Math.round(report.overallScore)}
            <span className="text-lg font-normal text-slate-500">/100</span>
          </p>
        </div>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
          {report.band}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Meter label="Correctness" value={report.correctnessScore} />
        <Meter label="Depth" value={report.depthScore} />
        <Meter label="Clarity" value={report.clarityScore} />
      </div>
      <p className="text-sm leading-relaxed">{report.summary}</p>
      {!report.aiNarrative ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The written AI summary was unavailable, so a basic summary is shown. Your scores are
          unaffected.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <List title="Strengths" items={report.strengths} />
        <List title="Areas to improve" items={report.weaknesses} />
      </div>
      <List title="Recommended next steps" items={report.recommendations} />
      <RubricPanel />
    </Card>
  );
}
