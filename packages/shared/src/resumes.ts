import { z } from "zod";

export const RESUME_PROMPT_VERSION = "resume-extract.v1";

/** Max file size: 5 MB */
export const MAX_RESUME_FILE_BYTES = 5 * 1024 * 1024;

/** Max extracted text chars sent to AI for processing (prevents huge token costs / prompt blowing) */
export const MAX_RESUME_TEXT_CHARS = 40_000;

export const ALLOWED_RESUME_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export type AllowedResumeMimeType = (typeof ALLOWED_RESUME_MIME_TYPES)[number];

export const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".docx"] as const;

export const resumeProjectSchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  technologies: z.array(z.string().trim().max(50)).default([]),
});
export type ResumeProject = z.infer<typeof resumeProjectSchema>;

export const resumeExperienceSchema = z.object({
  role: z.string().trim().max(100).optional(),
  company: z.string().trim().max(100).optional(),
  duration: z.string().trim().max(100).optional(),
  highlights: z.array(z.string().trim().max(300)).default([]),
});
export type ResumeExperience = z.infer<typeof resumeExperienceSchema>;

export const resumeEducationSchema = z.object({
  degree: z.string().trim().max(100).optional(),
  institution: z.string().trim().max(150).optional(),
  year: z.string().trim().max(50).optional(),
});
export type ResumeEducation = z.infer<typeof resumeEducationSchema>;

export const resumeParsedDataSchema = z.object({
  skills: z.array(z.string().trim().max(50)).default([]),
  technologies: z.array(z.string().trim().max(50)).default([]),
  projects: z.array(resumeProjectSchema).default([]),
  experience: z.array(resumeExperienceSchema).default([]),
  education: z.array(resumeEducationSchema).default([]),
});
export type ResumeParsedData = z.infer<typeof resumeParsedDataSchema>;

export interface ResumeSummaryDto {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  skills: string[];
  technologies: string[];
  projectsCount: number;
  experienceCount: number;
  educationCount: number;
  createdAt: string;
}

export interface ResumeDetailDto extends ResumeSummaryDto {
  projects: ResumeProject[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  /** Snippet of text or sanitized preview (never reveals private contact details) */
  previewText?: string;
}
