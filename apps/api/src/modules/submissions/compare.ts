/**
 * How program output is compared with the expected output. Forgiving about invisible things
 * (Windows line endings, trailing spaces, extra blank lines at the end), strict about everything
 * else, which is how most judges behave.
 */
export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export function outputsMatch(expected: string, actual: string): boolean {
  return normalizeOutput(expected) === normalizeOutput(actual);
}
