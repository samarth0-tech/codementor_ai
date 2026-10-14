// Execution limits. Each problem has its own time and memory limit (stored in the database);
// these are the hard bounds applied on top, so a mistyped limit can never ask Judge0 for
// something absurd. The Judge0 instance enforces its own maximums as well.

export const MIN_CPU_MS = 100;
export const MAX_CPU_MS = 10_000;
export const MIN_MEMORY_KB = 16_000;
export const MAX_MEMORY_KB = 512_000;
export const MAX_WALL_SECONDS = 15;

/** Maximum characters of program output / error text that we keep. */
export const MAX_CAPTURE_CHARS = 10_000;
export const MAX_COMPILE_CHARS = 8_000;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function toJudge0Limits(timeLimitMs: number, memoryLimitKb: number) {
  const cpuSeconds = clamp(timeLimitMs, MIN_CPU_MS, MAX_CPU_MS) / 1000;
  return {
    cpuTimeLimit: cpuSeconds,
    // Wall time protects against programs that sleep or wait: allow some slack, but not much.
    wallTimeLimit: Math.min(cpuSeconds * 2 + 1, MAX_WALL_SECONDS),
    memoryLimitKb: clamp(memoryLimitKb, MIN_MEMORY_KB, MAX_MEMORY_KB),
  };
}

export const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}\n...[output truncated]` : text;
