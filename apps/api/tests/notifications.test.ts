import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  NotificationListResponse,
  NotificationPreferencesDto,
  UnreadCountResponse,
} from "@codementor/shared";
import { createUser, hasDb, makeTestContext, resetDb } from "./helpers.js";
import { NotificationsService } from "../src/modules/notifications/notifications.service.js";

describe.skipIf(!hasDb)("Phase 15: Notifications & Reminders API", () => {
  const ctx = makeTestContext();
  const { app, prisma } = ctx;
  let authA: string;
  let userAId: string;
  let authB: string;
  let userBId: string;
  let service: NotificationsService;

  beforeEach(async () => {
    await resetDb(prisma);
    service = new NotificationsService(prisma);

    const uA = await createUser(prisma, "alice.notif@example.com", "Alice");
    authA = uA.auth;
    userAId = uA.user.id;

    const uB = await createUser(prisma, "bob.notif@example.com", "Bob");
    authB = uB.auth;
    userBId = uB.user.id;
  });

  it("requires authentication note", async () => {
    const res = await request(app).get("/api/v1/notifications");
    expect(res.status).toBe(401);
  });

  it("returns empty notification list and zero unread count for new user", async () => {
    const res = await request(app).get("/api/v1/notifications").set("Authorization", authA);

    expect(res.status).toBe(200);
    const body = res.body as NotificationListResponse;
    expect(body.data).toEqual([]);
    expect(body.unreadCount).toBe(0);
    expect(body.meta.total).toBe(0);

    const countRes = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", authA);

    expect(countRes.status).toBe(200);
    expect((countRes.body as UnreadCountResponse).unreadCount).toBe(0);
  });

  it("creates, lists, and paginates notifications with unread counts", async () => {
    // Create 3 notifications for Alice
    await service.createNotification(userAId, {
      type: "INTERVIEW_COMPLETED",
      title: "Interview Completed",
      message: "Score: 85/100",
      link: "/interviews/1",
    });

    await service.createNotification(userAId, {
      type: "CODE_REVIEW_COMPLETED",
      title: "Code Review Ready",
      message: "Quality: 90/100",
      link: "/problems/two-sum",
    });

    await service.createNotification(userAId, {
      type: "MILESTONE_REACHED",
      title: "First Problem Solved!",
      message: "Congratulations on solving Two Sum",
    });

    const res = await request(app)
      .get("/api/v1/notifications?limit=2&page=1")
      .set("Authorization", authA);

    expect(res.status).toBe(200);
    const body = res.body as NotificationListResponse;
    expect(body.data).toHaveLength(2);
    expect(body.unreadCount).toBe(3);
    expect(body.meta.total).toBe(3);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(2);

    // Page 2
    const resPage2 = await request(app)
      .get("/api/v1/notifications?limit=2&page=2")
      .set("Authorization", authA);

    expect(resPage2.status).toBe(200);
    expect((resPage2.body as NotificationListResponse).data).toHaveLength(1);
  });

  it("marks a single notification as read and enforces ownership", async () => {
    const notifA = await service.createNotification(userAId, {
      type: "SYSTEM",
      title: "Welcome",
      message: "Welcome to CodeMentor AI",
    });
    expect(notifA).not.toBeNull();

    // Bob tries to mark Alice's notification as read (should 404)
    const bobRes = await request(app)
      .patch(`/api/v1/notifications/${notifA!.id}/read`)
      .set("Authorization", authB);
    expect(bobRes.status).toBe(404);

    // Alice marks her own notification as read
    const aliceRes = await request(app)
      .patch(`/api/v1/notifications/${notifA!.id}/read`)
      .set("Authorization", authA);
    expect(aliceRes.status).toBe(200);
    expect(aliceRes.body.notification.read).toBe(true);
    expect(aliceRes.body.notification.readAt).toBeTruthy();

    // Verify unread count is now 0
    const countRes = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", authA);
    expect((countRes.body as UnreadCountResponse).unreadCount).toBe(0);
  });

  it("marks all notifications as read for the authenticated user only", async () => {
    // 2 notifications for Alice
    await service.createNotification(userAId, {
      type: "PRACTICE_REMINDER",
      title: "Practice Reminder",
      message: "Try a new problem today",
    });
    await service.createNotification(userAId, {
      type: "SYSTEM",
      title: "Update",
      message: "New features added",
    });

    // 1 notification for Bob
    await service.createNotification(userBId, {
      type: "PRACTICE_REMINDER",
      title: "Bob Reminder",
      message: "Keep practicing",
    });

    // Alice marks all as read
    const res = await request(app)
      .post("/api/v1/notifications/read-all")
      .set("Authorization", authA);

    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(2);

    // Alice has 0 unread
    const countA = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", authA);
    expect((countA.body as UnreadCountResponse).unreadCount).toBe(0);

    // Bob still has 1 unread
    const countB = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", authB);
    expect((countB.body as UnreadCountResponse).unreadCount).toBe(1);
  });

  it("prevents duplicate notifications with dedupeKey", async () => {
    const dedupeKey = "milestone-first-problem";

    const first = await service.createNotification(userAId, {
      type: "MILESTONE_REACHED",
      title: "First Problem Solved",
      message: "Great work!",
      dedupeKey,
    });

    const second = await service.createNotification(userAId, {
      type: "MILESTONE_REACHED",
      title: "First Problem Solved",
      message: "Great work!",
      dedupeKey,
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.id).toBe(second!.id);

    const totalCount = await prisma.notification.count({ where: { userId: userAId } });
    expect(totalCount).toBe(1);
  });

  it("manages notification preferences and respects disabled categories", async () => {
    // 1. Get default preferences
    const defaultRes = await request(app)
      .get("/api/v1/notifications/preferences")
      .set("Authorization", authA);

    expect(defaultRes.status).toBe(200);
    const defaults = defaultRes.body.preferences as NotificationPreferencesDto;
    expect(defaults.interviewCompleted).toBe(true);
    expect(defaults.codeReviewCompleted).toBe(true);
    expect(defaults.milestones).toBe(true);
    expect(defaults.practiceReminders).toBe(true);

    // 2. Disable practice reminders and code reviews
    const updateRes = await request(app)
      .put("/api/v1/notifications/preferences")
      .set("Authorization", authA)
      .send({
        practiceReminders: false,
        codeReviewCompleted: false,
      });

    expect(updateRes.status).toBe(200);
    const updated = updateRes.body.preferences as NotificationPreferencesDto;
    expect(updated.practiceReminders).toBe(false);
    expect(updated.codeReviewCompleted).toBe(false);
    expect(updated.interviewCompleted).toBe(true);

    // 3. Attempt to create disabled notification categories
    const reminderNotif = await service.createNotification(userAId, {
      type: "PRACTICE_REMINDER",
      title: "Reminder",
      message: "Time to code",
    });
    expect(reminderNotif).toBeNull();

    const reviewNotif = await service.createNotification(userAId, {
      type: "CODE_REVIEW_COMPLETED",
      title: "Review",
      message: "Review ready",
    });
    expect(reviewNotif).toBeNull();

    // 4. Allowed categories still work
    const allowedNotif = await service.createNotification(userAId, {
      type: "INTERVIEW_COMPLETED",
      title: "Interview Done",
      message: "Interview ready",
    });
    expect(allowedNotif).not.toBeNull();

    const count = await prisma.notification.count({ where: { userId: userAId } });
    expect(count).toBe(1);
  });
});
