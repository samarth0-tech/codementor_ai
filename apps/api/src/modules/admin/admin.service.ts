import type {
  AdminUserListQuery,
  AdminUserListResponse,
  AdminUserSummary,
  AdminUserDetail,
  AdminUpdateUserInput,
  PlatformStats,
} from "@codementor/shared";
import type { PrismaClient } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";

export class AdminService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── User list ─────────────────────────────────────────────────────────────

  async listUsers(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    const { page, limit, search, role, status, sortBy, sortOrder } = query;

    const where: Record<string, unknown> = {};
    if (role) where["role"] = role;
    if (status) where["status"] = status;
    if (search) {
      where["OR"] = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: {
              interviews: true,
              submissions: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const data: AdminUserSummary[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      interviewCount: u._count.interviews,
      submissionCount: u._count.submissions,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── User detail ───────────────────────────────────────────────────────────

  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw AppError.notFound("User not found");

    const [
      totalInterviews,
      completedInterviews,
      avgInterviewScore,
      totalSubmissions,
      acceptedSubmissions,
      totalReviews,
      totalResumes,
      totalAiCalls,
    ] = await Promise.all([
      this.prisma.interview.count({ where: { userId } }),
      this.prisma.interview.count({ where: { userId, status: "COMPLETED" } }),
      this.prisma.interview.aggregate({
        where: { userId, status: "COMPLETED", overallScore: { not: null } },
        _avg: { overallScore: true },
      }),
      this.prisma.submission.count({ where: { userId } }),
      this.prisma.submission.count({
        where: { userId, status: "COMPLETED", verdict: "ACCEPTED" },
      }),
      this.prisma.codeReview.count({ where: { submission: { userId } } }),
      this.prisma.resume.count({ where: { userId } }),
      this.prisma.aiCall.count({ where: { userId } }),
    ]);

    const averageInterviewScore =
      avgInterviewScore._avg.overallScore !== null &&
      avgInterviewScore._avg.overallScore !== undefined
        ? Number(avgInterviewScore._avg.overallScore.toFixed(1))
        : null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      stats: {
        totalInterviews,
        completedInterviews,
        averageInterviewScore,
        totalSubmissions,
        acceptedSubmissions,
        totalReviews,
        totalResumes,
        totalAiCalls,
      },
    };
  }

  // ── Update user ───────────────────────────────────────────────────────────

  async updateUser(
    userId: string,
    input: AdminUpdateUserInput,
    adminId: string,
  ): Promise<AdminUserDetail> {
    // Prevent admins from modifying themselves (guard against accidental self-demotion/suspension).
    if (userId === adminId) {
      throw AppError.badRequest("You cannot modify your own account through the admin panel");
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) throw AppError.notFound("User not found");

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    return this.getUserDetail(userId);
  }

  // ── Platform stats ────────────────────────────────────────────────────────

  async getPlatformStats(): Promise<PlatformStats> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      adminUsers,
      studentUsers,
      registeredToday,
      registeredThisWeek,
      totalInterviews,
      completedInterviews,
      inProgressInterviews,
      avgInterviewScore,
      totalSubmissions,
      acceptedSubmissions,
      totalReviews,
      avgReviewScore,
      totalProblems,
      publishedProblems,
      draftProblems,
      archivedProblems,
      totalAiCalls,
      aiCallsToday,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: "ACTIVE" } }),
      this.prisma.user.count({ where: { status: "SUSPENDED" } }),
      this.prisma.user.count({ where: { role: "ADMIN" } }),
      this.prisma.user.count({ where: { role: "STUDENT" } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      this.prisma.interview.count(),
      this.prisma.interview.count({ where: { status: "COMPLETED" } }),
      this.prisma.interview.count({ where: { status: "IN_PROGRESS" } }),
      this.prisma.interview.aggregate({
        where: { status: "COMPLETED", overallScore: { not: null } },
        _avg: { overallScore: true },
      }),
      this.prisma.submission.count(),
      this.prisma.submission.count({
        where: { status: "COMPLETED", verdict: "ACCEPTED" },
      }),
      this.prisma.codeReview.count(),
      this.prisma.codeReview.aggregate({
        _avg: { overallScore: true },
      }),
      this.prisma.problem.count(),
      this.prisma.problem.count({ where: { status: "PUBLISHED" } }),
      this.prisma.problem.count({ where: { status: "DRAFT" } }),
      this.prisma.problem.count({ where: { status: "ARCHIVED" } }),
      this.prisma.aiCall.count(),
      this.prisma.aiCall.count({ where: { createdAt: { gte: startOfToday } } }),
    ]);

    const interviewAvg =
      avgInterviewScore._avg.overallScore !== null &&
      avgInterviewScore._avg.overallScore !== undefined
        ? Number(avgInterviewScore._avg.overallScore.toFixed(1))
        : null;

    const reviewAvg =
      avgReviewScore._avg.overallScore !== null && avgReviewScore._avg.overallScore !== undefined
        ? Number(avgReviewScore._avg.overallScore.toFixed(1))
        : null;

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        admins: adminUsers,
        students: studentUsers,
        registeredToday,
        registeredThisWeek,
      },
      interviews: {
        total: totalInterviews,
        completed: completedInterviews,
        inProgress: inProgressInterviews,
        averageScore: interviewAvg,
      },
      submissions: {
        total: totalSubmissions,
        accepted: acceptedSubmissions,
        acceptanceRate:
          totalSubmissions > 0
            ? Number(((acceptedSubmissions / totalSubmissions) * 100).toFixed(1))
            : 0,
      },
      reviews: {
        total: totalReviews,
        averageScore: reviewAvg,
      },
      problems: {
        total: totalProblems,
        published: publishedProblems,
        draft: draftProblems,
        archived: archivedProblems,
      },
      aiCalls: {
        total: totalAiCalls,
        today: aiCallsToday,
      },
    };
  }
}
