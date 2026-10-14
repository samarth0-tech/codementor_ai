import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirectPath("/problems?x=1")).toBe("/problems?x=1");
  });
  it.each([
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "",
    undefined,
    42,
  ])("falls back for %j", (value) => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });
});
