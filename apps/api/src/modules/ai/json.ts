/**
 * Pulls a JSON value out of model text. Models sometimes wrap JSON in ```json fences or add a
 * sentence before/after it. Returns the parsed value, or undefined if nothing parseable is found.
 * NOTE: the result is still UNTRUSTED. It must be validated with a Zod schema before use.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}
