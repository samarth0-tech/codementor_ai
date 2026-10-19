import { z } from "zod";
import {
  resumeParsedDataSchema,
  type ResumeDetailDto,
  type ResumeSummaryDto,
  type ResumeProject,
  type ResumeExperience,
  type ResumeEducation,
  type ResumeParsedData,
} from "@codementor/shared";
import { AppError } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { AiService } from "../ai/ai.service.js";
import { buildResumeParsePrompt } from "../ai/prompts/resume.js";
import { extractResumeText } from "./extractor.js";

const uuid = z.uuid();

const resumeSelect = {
  id: true,
  userId: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  extractedText: true,
  skills: true,
  technologies: true,
  projects: true,
  experience: true,
  education: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ResumeSelect;

type ResumeRow = Prisma.ResumeGetPayload<{ select: typeof resumeSelect }>;

const toStrings = (val: unknown): string[] =>
  Array.isArray(val) ? val.filter((item): item is string => typeof item === "string") : [];

const toProjects = (val: unknown): ResumeProject[] =>
  Array.isArray(val) ? (val as ResumeProject[]) : [];

const toExperience = (val: unknown): ResumeExperience[] =>
  Array.isArray(val) ? (val as ResumeExperience[]) : [];

const toEducation = (val: unknown): ResumeEducation[] =>
  Array.isArray(val) ? (val as ResumeEducation[]) : [];

function toSummary(row: ResumeRow): ResumeSummaryDto {
  const skills = toStrings(row.skills);
  const technologies = toStrings(row.technologies);
  const projects = toProjects(row.projects);
  const experience = toExperience(row.experience);
  const education = toEducation(row.education);

  return {
    id: row.id,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    skills,
    technologies,
    projectsCount: projects.length,
    experienceCount: experience.length,
    educationCount: education.length,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(row: ResumeRow): ResumeDetailDto {
  const summary = toSummary(row);
  const preview = row.extractedText.slice(0, 500).trim();

  return {
    ...summary,
    projects: toProjects(row.projects),
    experience: toExperience(row.experience),
    education: toEducation(row.education),
    previewText: preview.length > 0 ? `${preview}...` : undefined,
  };
}

export class ResumeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AiService,
  ) {}

  async uploadAndParse(
    userId: string,
    fileBuffer: Buffer,
    originalFileName: string,
    declaredMimeType?: string,
  ): Promise<ResumeDetailDto> {
    // Step 1: Validate file & extract text
    const extracted = await extractResumeText(fileBuffer, originalFileName, declaredMimeType);

    // Step 2: Extract structured technical entities via AI
    const parsePrompt = buildResumeParsePrompt(extracted.extractedText);
    const parsed = await this.ai.generateStructured<ResumeParsedData>({
      userId,
      feature: "RESUME_PARSE",
      tier: "reasoning",
      temperature: 0.2,
      schema: resumeParsedDataSchema,
      ...parsePrompt,
    });

    // Step 3: Persist resume to database with strict userId association
    const row = await this.prisma.resume.create({
      data: {
        userId,
        fileName: extracted.fileName,
        fileSize: extracted.fileSize,
        mimeType: extracted.mimeType,
        extractedText: extracted.extractedText,
        skills: parsed.skills,
        technologies: parsed.technologies,
        projects: parsed.projects,
        experience: parsed.experience,
        education: parsed.education,
      },
      select: resumeSelect,
    });

    return toDetail(row);
  }

  async list(userId: string): Promise<ResumeSummaryDto[]> {
    const rows = await this.prisma.resume.findMany({
      where: { userId },
      select: resumeSelect,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toSummary);
  }

  async get(userId: string, id: string): Promise<ResumeDetailDto> {
    if (!uuid.safeParse(id).success) {
      throw AppError.notFound("Resume not found");
    }
    const row = await this.prisma.resume.findFirst({
      where: { id, userId },
      select: resumeSelect,
    });
    if (!row) {
      throw AppError.notFound("Resume not found");
    }
    return toDetail(row);
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!uuid.safeParse(id).success) {
      throw AppError.notFound("Resume not found");
    }
    const row = await this.prisma.resume.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!row) {
      throw AppError.notFound("Resume not found");
    }
    await this.prisma.resume.delete({
      where: { id: row.id },
    });
  }
}
