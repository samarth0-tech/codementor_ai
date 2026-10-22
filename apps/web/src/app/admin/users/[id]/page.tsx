import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AdminUserDetail, PublicUser } from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { serverGet } from "@/lib/server/api";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "User Details - Admin" };

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params;

  let userDetail: AdminUserDetail;
  let currentUser: PublicUser;

  try {
    const [detail, authData] = await Promise.all([
      serverGet<AdminUserDetail>(`/admin/users/${id}`),
      serverGet<{ user: PublicUser }>("/auth/me"),
    ]);
    userDetail = detail;
    currentUser = authData.user;
  } catch {
    notFound();
  }

  const { stats } = userDetail;
  const isSelf = userDetail.id === currentUser.id;

  return (
    <div className="space-y-6 pb-8">
      {/* Navigation and Title */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/admin/users"
              className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            >
              &larr; User Directory
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white flex items-center gap-3">
            {userDetail.name}
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                userDetail.role === "ADMIN"
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {userDetail.role}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                userDetail.status === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
              }`}
            >
              {userDetail.status}
            </span>
          </h1>
          <p className="text-xs text-slate-500">
            {userDetail.email} • ID: {userDetail.id}
          </p>
        </div>

        <ButtonLink href="/admin/users" variant="secondary" className="text-xs">
          Back to Directory
        </ButtonLink>
      </div>

      {/* Account Profile Details */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Account Timeline
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Registered:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {new Date(userDetail.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last Profile Update:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {new Date(userDetail.updatedAt).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last Login:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {userDetail.lastLoginAt
                  ? new Date(userDetail.lastLoginAt).toLocaleString()
                  : "Never"}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Interview Performance
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Total Started:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {stats.totalInterviews}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Completed:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {stats.completedInterviews}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Average AI Score:</span>
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {stats.averageInterviewScore !== null ? `${stats.averageInterviewScore}%` : "N/A"}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Code & AI Telemetry
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Submissions:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {stats.totalSubmissions} ({stats.acceptedSubmissions} passed)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Code Reviews:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {stats.totalReviews}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Resumes Uploaded:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {stats.totalResumes}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total AI Calls:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {stats.totalAiCalls}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {isSelf && (
        <Card className="p-4 bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
          This is your own administrator account. Governance restrictions prevent self-modification
          of status or role.
        </Card>
      )}
    </div>
  );
}
