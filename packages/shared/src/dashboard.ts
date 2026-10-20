import type { Verdict } from "./submissions.js";
import type { InterviewSummary } from "./interviews.js";

export interface ProblemStats {
  solved: number;
  attempted: number;
  totalAvailable: number;
  byDifficulty: {
    easy: { solved: number; total: number };
    medium: { solved: number; total: number };
    hard: { solved: number; total: number };
  };
}

export interface SubmissionStats {
  total: number;
  accepted: number;
  acceptanceRate: number; // percentage (0-100) rounded to 1 decimal place
  verdictCounts: Record<Verdict, number>;
}

export interface InterviewStats {
  total: number;
  completed: number;
  averageScore: number | null; // 0-100 rounded to 1 decimal place
  latest: InterviewSummary | null;
}

export interface ReviewStats {
  total: number;
  averageScore: number | null; // 0-100 rounded to 1 decimal place
  latest: {
    id: string;
    submissionId: string;
    problemSlug: string;
    problemTitle: string;
    overallScore: number;
    createdAt: string;
  } | null;
}

export interface ResumeStatus {
  hasResume: boolean;
  latest: {
    id: string;
    fileName: string;
    uploadedAt: string;
    skillsCount: number;
    projectsCount: number;
  } | null;
}

export type ActivityItemKind = "SUBMISSION" | "INTERVIEW" | "REVIEW" | "RESUME";

export interface ActivityItem {
  id: string;
  kind: ActivityItemKind;
  title: string;
  subtitle: string;
  timestamp: string;
  badge?: {
    text: string;
    variant: "success" | "warning" | "danger" | "neutral";
  };
  link: string;
}

export interface DashboardMetricsDto {
  problems: ProblemStats;
  submissions: SubmissionStats;
  interviews: InterviewStats;
  reviews: ReviewStats;
  resume: ResumeStatus;
  recentActivity: ActivityItem[];
}
