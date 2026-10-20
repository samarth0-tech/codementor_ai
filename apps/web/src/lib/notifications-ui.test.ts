import { describe, expect, it } from "vitest";
import { formatNotificationDate, getNotificationIcon } from "./notifications-ui";

describe("notifications-ui helpers", () => {
  describe("getNotificationIcon", () => {
    it("returns correct icons for notification types", () => {
      expect(getNotificationIcon("INTERVIEW_COMPLETED")).toBe("🎙️");
      expect(getNotificationIcon("CODE_REVIEW_COMPLETED")).toBe("🔍");
      expect(getNotificationIcon("MILESTONE_REACHED")).toBe("🏆");
      expect(getNotificationIcon("PRACTICE_REMINDER")).toBe("⏰");
      expect(getNotificationIcon("SYSTEM")).toBe("🔔");
    });
  });

  describe("formatNotificationDate", () => {
    it("formats recent timestamps", () => {
      const now = new Date().toISOString();
      expect(formatNotificationDate(now)).toBe("Just now");

      const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
      expect(formatNotificationDate(tenMinAgo)).toBe("10m ago");

      const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
      expect(formatNotificationDate(twoHoursAgo)).toBe("2h ago");

      const threeDaysAgo = new Date(Date.now() - 3 * 86400_000).toISOString();
      expect(formatNotificationDate(threeDaysAgo)).toBe("3d ago");
    });
  });
});
