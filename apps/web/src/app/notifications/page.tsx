import type { Metadata } from "next";
import type { NotificationListResponse, NotificationPreferencesDto } from "@codementor/shared";
import { serverGet } from "@/lib/server/api";
import { NotificationsView } from "./notifications-view";

export const metadata: Metadata = { title: "Notifications & Preferences" };

export default async function NotificationsPage() {
  const [list, prefs] = await Promise.all([
    serverGet<NotificationListResponse>("/notifications?limit=50"),
    serverGet<{ preferences: NotificationPreferencesDto }>("/notifications/preferences"),
  ]);

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          Notifications & Reminders
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Stay updated on your mock interview evaluations, code reviews, and milestones.
        </p>
      </div>

      <NotificationsView
        initialNotifications={list.data}
        initialUnreadCount={list.unreadCount}
        initialPreferences={prefs.preferences}
      />
    </div>
  );
}
