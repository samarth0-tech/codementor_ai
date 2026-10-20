import Link from "next/link";
import type { UnreadCountResponse } from "@codementor/shared";
import { serverGet } from "@/lib/server/api";

export async function NotificationBell() {
  let unreadCount = 0;
  try {
    const res = await serverGet<UnreadCountResponse>("/notifications/unread-count");
    unreadCount = res.unreadCount;
  } catch {
    // If not authenticated or error, don't show badge
  }

  return (
    <Link
      href="/notifications"
      className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
    >
      <span className="text-base" role="img" aria-hidden="true">
        🔔
      </span>
      {unreadCount > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white shadow-sm">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
