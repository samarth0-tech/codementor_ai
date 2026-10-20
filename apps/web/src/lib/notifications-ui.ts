import type { NotificationType } from "@codementor/shared";

export function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case "INTERVIEW_COMPLETED":
      return "🎙️";
    case "CODE_REVIEW_COMPLETED":
      return "🔍";
    case "MILESTONE_REACHED":
      return "🏆";
    case "PRACTICE_REMINDER":
      return "⏰";
    case "SYSTEM":
    default:
      return "🔔";
  }
}

export function formatNotificationDate(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}
