import { describe, expect, it } from "vitest";
import {
  decodeCode,
  encodeCode,
  formatMemory,
  formatTime,
  pollIntervalMs,
  verdictTone,
} from "./submission-ui";

describe("submission UI helpers", () => {
  it("polls until the submission is finished, then stops", () => {
    expect(pollIntervalMs(undefined)).toBe(800);
    expect(pollIntervalMs("QUEUED")).toBe(800);
    expect(pollIntervalMs("RUNNING")).toBe(800);
    expect(pollIntervalMs("COMPLETED")).toBe(false);
    expect(pollIntervalMs("FAILED")).toBe(false);
  });

  it("never colours an internal error like the student's mistake", () => {
    expect(verdictTone("ACCEPTED")).toBe("success");
    expect(verdictTone("WRONG_ANSWER")).toBe("error");
    expect(verdictTone("COMPILE_ERROR")).toBe("error");
    expect(verdictTone("INTERNAL_ERROR")).toBe("warn");
    expect(verdictTone(null)).toBe("neutral");
  });

  it("formats time and memory", () => {
    expect(formatTime(null)).toBe("-");
    expect(formatTime(42)).toBe("42 ms");
    expect(formatMemory(null)).toBe("-");
    expect(formatMemory(512)).toBe("512 KB");
    expect(formatMemory(3072)).toBe("3.0 MB");
  });

  it("remembers an intentionally empty editor (code is stored with a prefix)", () => {
    expect(decodeCode(encodeCode(""))).toBe("");
    expect(decodeCode(encodeCode("print(1)"))).toBe("print(1)");
    expect(decodeCode("")).toBeNull(); // nothing stored yet -> use the starter code
    expect(decodeCode("garbage")).toBeNull();
  });
});
