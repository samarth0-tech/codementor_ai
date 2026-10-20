import type {
  ActivityItem,
  DashboardMetricsDto,
  InterviewStats,
  InterviewSummary,
  ProblemStats,
  ResumeStatus,
  ReviewStats,
  SubmissionStats,
  Verdict,
} from "@codementor/shared";
import type { PrismaClient } from "../../lib/prisma.js";

type BadgeVariant = "success" | "warning" | "danger" | "neutral";

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getMetrics(userId: string): Promise<DashboardMetricsDto> {
    const [problems, submissions, interviews, reviews, resume, recentActivity] = await Promise.all([
      this.getProblemStats(userId),
      this.getSubmissionStats(userId),
      this.getInterviewStats(userId),
      this.getReviewStats(userId),
      this.getResumeStatus(userId),
      this.getRecentActivity(userId),
    ]);

    return {
      problems,
      submissions,
      interviews,
      reviews,
      resume,
      recentActivity,
    };
  }

  private async getProblemStats(userId: string): Promise<ProblemStats> {
    const [publishedProblems, attemptedProblems, solvedProblems] = await Promise.all([
      this.prisma.problem.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, difficulty: true },
      }),
      this.prisma.submission.findMany({
        where: { userId },
        select: { problemId: true },
        distinct: ["problemId"],
      }),
      this.prisma.submission.findMany({
        where: {
          userId,
          status: "COMPLETED",
          mode: "SUBMIT",
          verdict: "ACCEPTED",
        },
        select: { problemId: true, problem: { select: { difficulty: true } } },
        distinct: ["problemId"],
      }),
    ]);

    const totalEasy = publishedProblems.filter((p) => p.difficulty === "EASY").length;
    const totalMedium = publishedProblems.filter((p) => p.difficulty === "MEDIUM").length;
    const totalHard = publishedProblems.filter((p) => p.difficulty === "HARD").length;

    const solvedEasy = solvedProblems.filter((p) => p.problem.difficulty === "EASY").length;
    const solvedMedium = solvedProblems.filter((p) => p.problem.difficulty === "MEDIUM").length;
    const solvedHard = solvedProblems.filter((p) => p.problem.difficulty === "HARD").length;

    return {
      solved: solvedProblems.length,
      attempted: attemptedProblems.length,
      totalAvailable: publishedProblems.length,
      byDifficulty: {
        easy: { solved: solvedEasy, total: totalEasy },
        medium: { solved: solvedMedium, total: totalMedium },
        hard: { solved: solvedHard, total: totalHard },
      },
    };
  }

  private async getSubmissionStats(userId: string): Promise<SubmissionStats> {
    const [total, accepted, grouped] = await Promise.all([
      this.prisma.submission.count({ where: { userId } }),
      this.prisma.submission.count({
        where: { userId, status: "COMPLETED", verdict: "ACCEPTED" },
      }),
      this.prisma.submission.groupBy({
        by: ["verdict"],
        where: { userId, verdict: { not: null } },
        _count: { verdict: true },
      }),
    ]);

    const verdictCounts: Record<Verdict, number> = {
      ACCEPTED: 0,
      WRONG_ANSWER: 0,
      TIME_LIMIT: 0,
      MEMORY_LIMIT: 0,
      RUNTIME_ERROR: 0,
      COMPILE_ERROR: 0,
      INTERNAL_ERROR: 0,
    };

    for (const item of grouped) {
      if (item.verdict && item.verdict in verdictCounts) {
        verdictCounts[item.verdict as Verdict] = item._count.verdict;
      }
    }

    const acceptanceRate = total > 0 ? Number(((accepted / total) * 100).toFixed(1)) : 0;

    return {
      total,
      accepted,
      acceptanceRate,
      verdictCounts,
    };
  }

  private async getInterviewStats(userId: string): Promise<InterviewStats> {
    const [total, completed, avgAggregate, latestRow] = await Promise.all([
      this.prisma.interview.count({ where: { userId } }),
      this.prisma.interview.count({ where: { userId, status: "COMPLETED" } }),
      this.prisma.interview.aggregate({
        where: { userId, status: "COMPLETED", overallScore: { not: null } },
        _avg: { overallScore: true },
      }),
      this.prisma.interview.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { questions: { select: { answer: { select: { id: true } } } } },
      }),
    ]);

    const averageScore =
      avgAggregate._avg.overallScore !== null && avgAggregate._avg.overallScore !== undefined
        ? Number(avgAggregate._avg.overallScore.toFixed(1))
        : null;

    let latest: InterviewSummary | null = null;
    if (latestRow) {
      latest = {
        id: latestRow.id,
        topic: latestRow.topic,
        difficulty: latestRow.difficulty,
        status: latestRow.status,
        overallScore: latestRow.overallScore,
        plannedQuestionCount: latestRow.plannedQuestionCount,
        answeredCount: latestRow.questions.filter((q) => q.answer).length,
        startedAt: latestRow.startedAt.toISOString(),
        endedAt: latestRow.endedAt?.toISOString() ?? null,
      };
    }

    return {
      total,
      completed,
      averageScore,
      latest,
    };
  }

  private async getReviewStats(userId: string): Promise<ReviewStats> {
    const [total, avgAggregate, latestRow] = await Promise.all([
      this.prisma.codeReview.count({
        where: { submission: { userId } },
      }),
      this.prisma.codeReview.aggregate({
        where: { submission: { userId } },
        _avg: { overallScore: true },
      }),
      this.prisma.codeReview.findFirst({
        where: { submission: { userId } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          submissionId: true,
          overallScore: true,
          createdAt: true,
          submission: {
            select: { problem: { select: { slug: true, title: true } } },
          },
        },
      }),
    ]);

    const averageScore =
      avgAggregate._avg.overallScore !== null && avgAggregate._avg.overallScore !== undefined
        ? Number(avgAggregate._avg.overallScore.toFixed(1))
        : null;

    return {
      total,
      averageScore,
      latest: latestRow
        ? {
            id: latestRow.id,
            submissionId: latestRow.submissionId,
            problemSlug: latestRow.submission.problem.slug,
            problemTitle: latestRow.submission.problem.title,
            overallScore: latestRow.overallScore,
            createdAt: latestRow.createdAt.toISOString(),
          }
        : null,
    };
  }

  private async getResumeStatus(userId: string): Promise<ResumeStatus> {
    const latest = await this.prisma.resume.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        createdAt: true,
        skills: true,
        projects: true,
      },
    });

    if (!latest) {
      return { hasResume: false, latest: null };
    }

    const skillsCount = Array.isArray(latest.skills) ? latest.skills.length : 0;
    const projectsCount = Array.isArray(latest.projects) ? latest.projects.length : 0;

    return {
      hasResume: true,
      latest: {
        id: latest.id,
        fileName: latest.fileName,
        uploadedAt: latest.createdAt.toISOString(),
        skillsCount,
        projectsCount,
      },
    };
  }

  private async getRecentActivity(userId: string): Promise<ActivityItem[]> {
    const [submissions, interviews, reviews] = await Promise.all([
      this.prisma.submission.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          mode: true,
          verdict: true,
          status: true,
          createdAt: true,
          problem: { select: { slug: true, title: true } },
        },
      }),
      this.prisma.interview.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          topic: true,
          status: true,
          overallScore: true,
          createdAt: true,
        },
      }),
      this.prisma.codeReview.findMany({
        where: { submission: { userId } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          overallScore: true,
          createdAt: true,
          submission: {
            select: { problem: { select: { slug: true, title: true } } },
          },
        },
      }),
    ]);

    const items: ActivityItem[] = [];

    for (const s of submissions) {
      const isAccepted = s.verdict === "ACCEPTED";
      const isCompileError = s.verdict === "COMPILE_ERROR";
      const isPending = s.status === "QUEUED" || s.status === "RUNNING";

      let badgeVariant: BadgeVariant = "neutral";
      if (isAccepted) badgeVariant = "success";
      else if (isCompileError) badgeVariant = "danger";
      else if (!isPending && s.verdict) badgeVariant = "warning";

      items.push({
        id: `sub-${s.id}`,
        kind: "SUBMISSION",
        title: s.problem.title,
        subtitle: `${s.mode === "SUBMIT" ? "Submitted" : "Ran test cases"} • ${s.verdict ?? s.status}`,
        timestamp: s.createdAt.toISOString(),
        badge: {
          text: s.verdict ?? s.status,
          variant: badgeVariant,
        },
        link: `/problems/${s.problem.slug}`,
      });
    }

    for (const i of interviews) {
      let badgeVariant: BadgeVariant = "neutral";
      if (i.status === "COMPLETED") badgeVariant = "success";
      else if (i.status === "IN_PROGRESS") badgeVariant = "warning";
      else if (i.status === "ABANDONED" || i.status === "EXPIRED") badgeVariant = "danger";

      items.push({
        id: `int-${i.id}`,
        kind: "INTERVIEW",
        title: i.topic,
        subtitle:
          i.overallScore !== null
            ? `Completed with score ${Math.round(i.overallScore)}/100`
            : `Status: ${i.status}`,
        timestamp: i.createdAt.toISOString(),
        badge: {
          text: i.overallScore !== null ? `${Math.round(i.overallScore)}%` : i.status,
          variant: badgeVariant,
        },
        link: `/interviews/${i.id}`,
      });
    }

    for (const r of reviews) {
      items.push({
        id: `rev-${r.id}`,
        kind: "REVIEW",
        title: `AI Code Review: ${r.submission.problem.title}`,
        subtitle: `Scored ${Math.round(r.overallScore)}/100 across correctness, readability & maintainability`,
        timestamp: r.createdAt.toISOString(),
        badge: {
          text: `${Math.round(r.overallScore)}/100`,
          variant: r.overallScore >= 70 ? "success" : "warning",
        },
        link: `/problems/${r.submission.problem.slug}`,
      });
    }

    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }
}
