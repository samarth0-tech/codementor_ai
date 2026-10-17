import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { canRequestReview, ratingBarClass, reviewErrorMessage } from "./review-ui";

describe("canRequestReview", () => {
  it("allows finished submissions with a real verdict", () => {
    expect(canRequestReview({ status: "COMPLETED", verdict: "ACCEPTED" })).toBe(true);
    expect(canRequestReview({ status: "COMPLETED", verdict: "WRONG_ANSWER" })).toBe(true);
    expect(canRequestReview({ status: "COMPLETED", verdict: "COMPILE_ERROR" })).toBe(true);
  });
  it("refuses unfinished submissions and ones that failed on our side", () => {
    expect(canRequestReview(undefined)).toBe(false);
    expect(canRequestReview({ status: "QUEUED", verdict: null })).toBe(false);
    expect(canRequestReview({ status: "RUNNING", verdict: null })).toBe(false);
    expect(canRequestReview({ status: "FAILED", verdict: "INTERNAL_ERROR" })).toBe(false);
    expect(canRequestReview({ status: "COMPLETED", verdict: "INTERNAL_ERROR" })).toBe(false);
    expect(canRequestReview({ status: "COMPLETED", verdict: null })).toBe(false);
  });
});

describe("reviewErrorMessage", () => {
  const err = (code: string, message = "raw server text") => new ApiError(400, code, message);
  it.each([
    ["AI_NOT_CONFIGURED", /not set up/],
    ["RATE_LIMITED", /wait a while/],
    ["AI_QUOTA_EXCEEDED", /tomorrow/],
    ["SUBMISSION_NOT_REVIEWABLE", /cannot be reviewed/],
    ["CODE_TOO_LARGE_FOR_REVIEW", /too long/],
    ["AI_UNAVAILABLE", /try again/],
    ["AI_INVALID_OUTPUT", /try again/],
    ["AI_TIMEOUT", /try again/],
  ])("%s -> friendly sentence", (code, expected) => {
    expect(reviewErrorMessage(err(code))).toMatch(expected);
  });
  it("falls back to the server message for unknown ApiErrors, and a generic one otherwise", () => {
    expect(reviewErrorMessage(err("SOMETHING_NEW", "Specific text"))).toBe("Specific text");
    expect(reviewErrorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
  });
});

describe("ratingBarClass", () => {
  it("colours by rating", () => {
    expect(ratingBarClass(9)).toContain("emerald");
    expect(ratingBarClass(5)).toContain("amber");
    expect(ratingBarClass(2)).toContain("red");
  });
});
