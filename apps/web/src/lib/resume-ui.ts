import type { ResumeDetailDto, ResumeSummaryDto } from "@codementor/shared";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatResumeDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

export function getResumeHighlight(resume: ResumeSummaryDto | ResumeDetailDto): string {
  const parts: string[] = [];
  if (resume.skills.length > 0) {
    parts.push(`${resume.skills.length} skills`);
  }
  if (resume.projectsCount > 0) {
    parts.push(`${resume.projectsCount} projects`);
  }
  if (resume.experienceCount > 0) {
    parts.push(`${resume.experienceCount} roles`);
  }
  return parts.length > 0 ? parts.join(" • ") : "No entities extracted";
}
