import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "INTERVIEW_COMPLETED",
  "CODE_REVIEW_COMPLETED",
  "MILESTONE_REACHED",
  "PRACTICE_REMINDER",
  "SYSTEM",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferencesDto {
  interviewCompleted: boolean;
  codeReviewCompleted: boolean;
  milestones: boolean;
  practiceReminders: boolean;
}

export const updateNotificationPreferencesSchema = z.object({
  interviewCompleted: z.boolean().optional(),
  codeReviewCompleted: z.boolean().optional(),
  milestones: z.boolean().optional(),
  practiceReminders: z.boolean().optional(),
});

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;

export interface NotificationListResponse {
  data: NotificationDto[];
  unreadCount: number;
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface UnreadCountResponse {
  unreadCount: number;
}
