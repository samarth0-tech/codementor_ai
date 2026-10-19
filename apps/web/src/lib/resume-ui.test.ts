import { describe, expect, it } from "vitest";
import { formatFileSize, formatResumeDate, getResumeHighlight } from "./resume-ui";
import type { ResumeSummaryDto } from "@codementor/shared";

describe("resume-ui helpers", () => {
  it("formats file sizes correctly", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024 * 15)).toBe("15.0 KB");
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });

  it("formats resume dates", () => {
    const formatted = formatResumeDate("2026-10-19T10:00:00.000Z");
    expect(formatted).toContain("2026");
  });

  it("computes resume highlights summary", () => {
    const mock: ResumeSummaryDto = {
      id: "123",
      fileName: "john_doe.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      skills: ["TypeScript", "React"],
      technologies: ["Docker"],
      projectsCount: 2,
      experienceCount: 1,
      educationCount: 1,
      createdAt: new Date().toISOString(),
    };
    expect(getResumeHighlight(mock)).toBe("2 skills • 2 projects • 1 roles");
  });
});
