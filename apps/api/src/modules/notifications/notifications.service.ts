import type {
  NotificationDto,
  NotificationListResponse,
  NotificationPreferencesDto,
  NotificationType,
  UnreadCountResponse,
  UpdateNotificationPreferencesInput,
} from "@codementor/shared";
import type { PrismaClient } from "../../lib/prisma.js";

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  dedupeKey?: string | null;
}

export class NotificationsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates a notification for a user, respecting deduplication keys and user preferences.
   * If a notification with the same dedupeKey already exists for this user, returns the existing record.
   */
  async createNotification(
    userId: string,
    input: CreateNotificationInput,
  ): Promise<NotificationDto | null> {
    const prefs = await this.getPreferences(userId);

    // Verify user preferences allow this notification category
    if (input.type === "INTERVIEW_COMPLETED" && !prefs.interviewCompleted) return null;
    if (input.type === "CODE_REVIEW_COMPLETED" && !prefs.codeReviewCompleted) return null;
    if (input.type === "MILESTONE_REACHED" && !prefs.milestones) return null;
    if (input.type === "PRACTICE_REMINDER" && !prefs.practiceReminders) return null;

    // Check deduplication key
    if (input.dedupeKey) {
      const existing = await this.prisma.notification.findUnique({
        where: {
          userId_dedupeKey: {
            userId,
            dedupeKey: input.dedupeKey,
          },
        },
      });
      if (existing) {
        return this.toDto(existing);
      }
    }

    const row = await this.prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
      },
    });

    return this.toDto(row);
  }

  async list(
    userId: string,
    options: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ): Promise<NotificationListResponse> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(options.unreadOnly ? { read: false } : {}),
    };

    const [total, unreadCount, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((r) => this.toDto(r)),
      unreadCount,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  async getUnreadCount(userId: string): Promise<UnreadCountResponse> {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { unreadCount };
  }

  async markAsRead(userId: string, id: string): Promise<NotificationDto | null> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) return null;

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });

    return this.toDto(updated);
  }

  async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      return {
        interviewCompleted: true,
        codeReviewCompleted: true,
        milestones: true,
        practiceReminders: true,
      };
    }

    return {
      interviewCompleted: pref.interviewCompleted,
      codeReviewCompleted: pref.codeReviewCompleted,
      milestones: pref.milestones,
      practiceReminders: pref.practiceReminders,
    };
  }

  async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferencesDto> {
    const pref = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        interviewCompleted: input.interviewCompleted ?? true,
        codeReviewCompleted: input.codeReviewCompleted ?? true,
        milestones: input.milestones ?? true,
        practiceReminders: input.practiceReminders ?? true,
      },
      update: {
        ...(input.interviewCompleted !== undefined
          ? { interviewCompleted: input.interviewCompleted }
          : {}),
        ...(input.codeReviewCompleted !== undefined
          ? { codeReviewCompleted: input.codeReviewCompleted }
          : {}),
        ...(input.milestones !== undefined ? { milestones: input.milestones } : {}),
        ...(input.practiceReminders !== undefined
          ? { practiceReminders: input.practiceReminders }
          : {}),
      },
    });

    return {
      interviewCompleted: pref.interviewCompleted,
      codeReviewCompleted: pref.codeReviewCompleted,
      milestones: pref.milestones,
      practiceReminders: pref.practiceReminders,
    };
  }

  private toDto(row: {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    link: string | null;
    read: boolean;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationDto {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      link: row.link,
      read: row.read,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
