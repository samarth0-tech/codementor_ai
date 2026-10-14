import { formatRemaining } from "./interview-ui";

// A stopwatch for the problem workspace. It is plain data (two timestamps) so it can be saved in
// the browser, survive a refresh, and be tested without any UI.

export interface TimerState {
  startedAt: number | null;
  stoppedAt: number | null;
}

export const emptyTimer: TimerState = { startedAt: null, stoppedAt: null };

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Reads a saved timer. Anything unexpected (tampered or corrupted storage) becomes an empty timer. */
export function parseTimer(raw: string): TimerState {
  try {
    const value = JSON.parse(raw) as Partial<TimerState>;
    const startedAt = isTime(value.startedAt) ? value.startedAt : null;
    const stoppedAt = isTime(value.stoppedAt) ? value.stoppedAt : null;
    if (startedAt === null) return emptyTimer;
    if (stoppedAt !== null && stoppedAt < startedAt) return { startedAt, stoppedAt: null };
    return { startedAt, stoppedAt };
  } catch {
    return emptyTimer;
  }
}

export const serializeTimer = (state: TimerState): string => JSON.stringify(state);

/** Starting an already-started timer does nothing. */
export function startTimer(state: TimerState, now: number): TimerState {
  return state.startedAt === null ? { startedAt: now, stoppedAt: null } : state;
}

/** Stopping a timer that is not running does nothing. */
export function stopTimer(state: TimerState, now: number): TimerState {
  if (state.startedAt === null || state.stoppedAt !== null) return state;
  return { ...state, stoppedAt: Math.max(now, state.startedAt) };
}

export const isRunning = (state: TimerState): boolean =>
  state.startedAt !== null && state.stoppedAt === null;

export function elapsedMs(state: TimerState, now: number): number {
  if (state.startedAt === null) return 0;
  return Math.max(0, (state.stoppedAt ?? now) - state.startedAt);
}

export const formatElapsed = (ms: number): string => formatRemaining(ms);
