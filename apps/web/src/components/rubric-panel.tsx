import { BANDS, RUBRIC } from "@codementor/shared";

/** Shows exactly how scores are calculated (same numbers the server uses). */
export function RubricPanel() {
  return (
    <details className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700">
      <summary className="cursor-pointer font-medium">How you are scored</summary>
      <div className="mt-3 space-y-3 text-slate-600 dark:text-slate-300">
        <p>
          The AI rates each answer from 0 to 10 on three criteria. The score out of 100 is then
          calculated with fixed weights, so it is the same every time.
        </p>
        <ul className="space-y-1">
          {RUBRIC.map((c) => (
            <li key={c.key}>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {c.label} ({Math.round(c.weight * 100)}%)
              </span>
              : {c.description}
            </li>
          ))}
        </ul>
        <p>Bands: {BANDS.map((b) => `${b.label} (${b.min}+)`).join(", ")}.</p>
      </div>
    </details>
  );
}
