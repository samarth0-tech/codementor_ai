import type { Metadata } from "next";
import type { AdminUserListResponse, PublicUser } from "@codementor/shared";
import { serverGet } from "@/lib/server/api";
import { ButtonLink } from "@/components/ui/button";
import { UserManagementView } from "./user-management-view";

export const metadata: Metadata = { title: "User Management - Admin" };

export default async function AdminUsersPage() {
  const [list, { user: currentUser }] = await Promise.all([
    serverGet<AdminUserListResponse>("/admin/users?limit=20"),
    serverGet<{ user: PublicUser }>("/auth/me"),
  ]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            User Directory & Access Control
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage student and administrator accounts, roles, and suspension states.
          </p>
        </div>
        <ButtonLink href="/admin" variant="secondary" className="text-xs">
          &larr; Admin Overview
        </ButtonLink>
      </div>

      <UserManagementView
        initialUsers={list.data}
        initialMeta={list.meta}
        currentAdminId={currentUser.id}
      />
    </div>
  );
}
