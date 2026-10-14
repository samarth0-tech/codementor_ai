import { describe, expect, it } from "vitest";
import {
  elapsedMs,
  emptyTimer,
  isRunning,
  parseTimer,
  serializeTimer,
  startTimer,
  stopTimer,
} from "./workspace-timer";

describe("workspace timer", () => {
  it("starts once and measures elapsed time", () => {
    const started = startTimer(emptyTimer, 1000);
    expect(started).toEqual({ startedAt: 1000, stoppedAt: null });
    expect(isRunning(started)).toBe(true);
    expect(startTimer(started, 9999)).toBe(started); // second start is ignored
    expect(elapsedMs(started, 4500)).toBe(3500);
  });

  it("stops and freezes the elapsed time", () => {
    const stopped = stopTimer(startTimer(emptyTimer, 1000), 6000);
    expect(isRunning(stopped)).toBe(false);
    expect(elapsedMs(stopped, 999_999)).toBe(5000);
    expect(stopTimer(stopped, 70_000)).toBe(stopped); // already stopped
  });

  it("does nothing when stopping a timer that never started", () => {
    expect(stopTimer(emptyTimer, 5000)).toBe(emptyTimer);
    expect(elapsedMs(emptyTimer, 5000)).toBe(0);
  });

  it("survives a save/load round trip", () => {
    const state = stopTimer(startTimer(emptyTimer, 1000), 2500);
    expect(parseTimer(serializeTimer(state))).toEqual(state);
  });

  it.each([
    ["not json", "{oops"],
    ["wrong types", '{"startedAt":"yesterday","stoppedAt":null}'],
    ["negative times", '{"startedAt":-5,"stoppedAt":null}'],
    ["null", "null"],
    ["empty", ""],
  ])("treats corrupted storage (%s) as an empty timer", (_n, raw) => {
    expect(parseTimer(raw)).toEqual(emptyTimer);
  });

  it("drops a stop time that is earlier than the start", () => {
    expect(parseTimer('{"startedAt":5000,"stoppedAt":1000}')).toEqual({
      startedAt: 5000,
      stoppedAt: null,
    });
  });

  it("never reports negative time (clock changes)", () => {
    expect(elapsedMs({ startedAt: 5000, stoppedAt: null }, 1000)).toBe(0);
  });
});
