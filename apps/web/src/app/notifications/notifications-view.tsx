"use client";

import { useState } from "react";
import Link from "next/link";
import type { NotificationDto, NotificationPreferencesDto } from "@codementor/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { formatNotificationDate, getNotificationIcon } from "@/lib/notifications-ui";

interface Props {
  initialNotifications: NotificationDto[];
  initialUnreadCount: number;
  initialPreferences: NotificationPreferencesDto;
}

export function NotificationsView({
  initialNotifications,
  initialUnreadCount,
  initialPreferences,
}: Props) {
  const [items, setItems] = useState<NotificationDto[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [prefs, setPrefs] = useState<NotificationPreferencesDto>(initialPreferences);
  const [savingPref, setSavingPref] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const displayedItems = filter === "unread" ? items.filter((item) => !item.read) : items;

  async function handleMarkRead(id: string) {
    try {
      await api.patch<{ notification: NotificationDto }>(`/notifications/${id}/read`);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, read: true, readAt: new Date().toISOString() } : item,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }

  async function handleMarkAllRead() {
    setIsMarkingAll(true);
    try {
      await api.post("/notifications/read-all");
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setIsMarkingAll(false);
    }
  }

  async function handleTogglePref(key: keyof NotificationPreferencesDto) {
    const nextVal = !prefs[key];
    const newPrefs = { ...prefs, [key]: nextVal };
    setPrefs(newPrefs);
    setSavingPref(true);
    try {
      await api.patch<{ preferences: NotificationPreferencesDto }>("/notifications/preferences", {
        [key]: nextVal,
      });
    } catch {
      // rollback
      setPrefs(prefs);
    } finally {
      setSavingPref(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Notifications list (2 cols) */}
      <div className="space-y-4 lg:col-span-2">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                filter === "all"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                filter === "unread"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <Button
              variant="ghost"
              disabled={isMarkingAll}
              onClick={handleMarkAllRead}
              className="text-xs"
            >
              {isMarkingAll ? "Marking..." : "✓ Mark all as read"}
            </Button>
          )}
        </div>

        {/* Items */}
        {displayedItems.length > 0 ? (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/60">
            {displayedItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-3 p-4 transition ${
                  item.read
                    ? "bg-white dark:bg-transparent"
                    : "bg-indigo-50/40 dark:bg-indigo-950/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-xl" role="img" aria-hidden="true">
                    {getNotificationIcon(item.type)}
                  </span>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </p>
                      {!item.read && (
                        <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{item.message}</p>
                    <div className="flex items-center gap-3 pt-1 text-xs">
                      <span className="text-slate-400">
                        {formatNotificationDate(item.createdAt)}
                      </span>
                      {item.link && (
                        <Link
                          href={item.link}
                          onClick={() => {
                            if (!item.read) handleMarkRead(item.id);
                          }}
                          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          View details →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {!item.read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(item.id)}
                    title="Mark as read"
                    className="shrink-0 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    ✓ Read
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center space-y-2 p-8 text-center">
            <span className="text-2xl">✨</span>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {filter === "unread"
                ? "You are completely caught up!"
                : "You will receive updates when mock interviews finish, reviews are generated, or milestones are reached."}
            </p>
          </Card>
        )}
      </div>

      {/* Preferences column (1 col) */}
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Notification Preferences
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Control which in-app updates and reminders you receive.
            </p>
          </div>

          <div className="space-y-3 pt-2 text-sm">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                🎙️ Mock interview completions
              </span>
              <input
                type="checkbox"
                checked={prefs.interviewCompleted}
                disabled={savingPref}
                onChange={() => handleTogglePref("interviewCompleted")}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                🔍 AI code reviews
              </span>
              <input
                type="checkbox"
                checked={prefs.codeReviewCompleted}
                disabled={savingPref}
                onChange={() => handleTogglePref("codeReviewCompleted")}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                🏆 Progress milestones
              </span>
              <input
                type="checkbox"
                checked={prefs.milestones}
                disabled={savingPref}
                onChange={() => handleTogglePref("milestones")}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                ⏰ Practice reminders
              </span>
              <input
                type="checkbox"
                checked={prefs.practiceReminders}
                disabled={savingPref}
                onChange={() => handleTogglePref("practiceReminders")}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </div>
        </Card>
      </div>
    </div>
  );
}
