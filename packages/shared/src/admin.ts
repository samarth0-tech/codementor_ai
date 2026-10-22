import { z } from "zod";
import type { Role, UserStatus } from "./constants.js";

// ── Admin user listing ──────────────────────────────────────────────────────

export const adminUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  role: z.enum(["STUDENT", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  sortBy: z.enum(["createdAt", "name", "email", "lastLoginAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  interviewCount: number;
  submissionCount: number;
}

export interface AdminUserListResponse {
  data: AdminUserSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ── Admin user detail ───────────────────────────────────────────────────────

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: {
    totalInterviews: number;
    completedInterviews: number;
    averageInterviewScore: number | null;
    totalSubmissions: number;
    acceptedSubmissions: number;
    totalReviews: number;
    totalResumes: number;
    totalAiCalls: number;
  };
}

// ── Admin user update ───────────────────────────────────────────────────────

export const adminUpdateUserSchema = z
  .object({
    role: z.enum(["STUDENT", "ADMIN"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: "At least one of role or status must be provided",
  });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

// ── Platform-wide stats ─────────────────────────────────────────────────────

export interface PlatformStats {
  users: {
    total: number;
    active: number;
    suspended: number;
    admins: number;
    students: number;
    registeredToday: number;
    registeredThisWeek: number;
  };
  interviews: {
    total: number;
    completed: number;
    inProgress: number;
    averageScore: number | null;
  };
  submissions: {
    total: number;
    accepted: number;
    acceptanceRate: number;
  };
  reviews: {
    total: number;
    averageScore: number | null;
  };
  problems: {
    total: number;
    published: number;
    draft: number;
    archived: number;
  };
  aiCalls: {
    total: number;
    today: number;
  };
}
