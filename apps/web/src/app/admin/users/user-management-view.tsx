"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminUserSummary, Role, UserStatus } from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

interface Props {
  initialUsers: AdminUserSummary[];
  initialMeta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  currentAdminId: string;
}

export function UserManagementView({ initialUsers, initialMeta, currentAdminId }: Props) {
  const [users, setUsers] = useState<AdminUserSummary[]>(initialUsers);
  const [meta, setMeta] = useState(initialMeta);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function fetchUsers(params: {
    page?: number;
    search?: string;
    role?: string;
    status?: string;
  }) {
    setLoading(true);
    setActionError(null);
    try {
      const q = new URLSearchParams();
      if (params.page) q.set("page", String(params.page));
      if (params.search) q.set("search", params.search);
      if (params.role && params.role !== "ALL") q.set("role", params.role);
      if (params.status && params.status !== "ALL") q.set("status", params.status);

      const res = await api.get<{
        data: AdminUserSummary[];
        meta: { total: number; page: number; limit: number; totalPages: number };
      }>(`/admin/users?${q.toString()}`);

      setUsers(res.data);
      setMeta(res.meta);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load users";
      setActionError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    void fetchUsers({ page: 1, search, role: roleFilter, status: statusFilter });
  }

  async function handleToggleStatus(user: AdminUserSummary) {
    const newStatus: UserStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const confirmMsg =
      newStatus === "SUSPENDED"
        ? `Are you sure you want to suspend ${user.name} (${user.email})? They will be unable to log in.`
        : `Are you sure you want to reactivate ${user.name}?`;

    if (!window.confirm(confirmMsg)) return;

    setUpdatingId(user.id);
    setActionError(null);
    try {
      await api.patch(`/admin/users/${user.id}`, { status: newStatus });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update user status";
      setActionError(msg);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleRole(user: AdminUserSummary) {
    const newRole: Role = user.role === "ADMIN" ? "STUDENT" : "ADMIN";
    const confirmMsg =
      newRole === "ADMIN"
        ? `Grant administrator privileges to ${user.name} (${user.email})?`
        : `Demote ${user.name} to Student role?`;

    if (!window.confirm(confirmMsg)) return;

    setUpdatingId(user.id);
    setActionError(null);
    try {
      await api.patch(`/admin/users/${user.id}`, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change user role";
      setActionError(msg);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls & Filter Bar */}
      <Card className="p-4">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              aria-label="Search by name or email"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <Button type="submit" variant="secondary" disabled={loading} className="text-xs">
              Search
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <label htmlFor="role-filter" className="font-medium">
                Role:
              </label>
              <select
                id="role-filter"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  void fetchUsers({
                    page: 1,
                    search,
                    role: e.target.value,
                    status: statusFilter,
                  });
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Roles</option>
                <option value="STUDENT">Student</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <label htmlFor="status-filter" className="font-medium">
                Status:
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  void fetchUsers({
                    page: 1,
                    search,
                    role: roleFilter,
                    status: e.target.value,
                  });
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>
        </form>
      </Card>

      {/* Error alert */}
      {actionError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300">
          {actionError}
        </div>
      )}

      {/* Users Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <tr>
                <th className="p-4 font-semibold">User</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Activity</th>
                <th className="p-4 font-semibold">Registered</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No users found matching current filters.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = u.id === currentAdminId;
                  const isUpdating = updatingId === u.id;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                    >
                      <td className="p-4">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                        >
                          {u.name}
                        </Link>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            u.role === "ADMIN"
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            u.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        <div>{u.interviewCount} interviews</div>
                        <div>{u.submissionCount} submissions</div>
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        {isSelf ? (
                          <span className="text-xs text-slate-400 italic">Self (Admin)</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              disabled={isUpdating}
                              onClick={() => void handleToggleRole(u)}
                              className="text-xs py-1 px-2 h-auto"
                            >
                              {u.role === "ADMIN" ? "Demote" : "Promote"}
                            </Button>
                            <Button
                              variant={u.status === "ACTIVE" ? "danger" : "secondary"}
                              disabled={isUpdating}
                              onClick={() => void handleToggleStatus(u)}
                              className="text-xs py-1 px-2 h-auto"
                            >
                              {u.status === "ACTIVE" ? "Suspend" : "Activate"}
                            </Button>
                            <Link
                              href={`/admin/users/${u.id}`}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 px-2 py-1"
                            >
                              Details
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 p-4 dark:border-slate-800 text-xs text-slate-500">
            <div>
              Showing page <span className="font-semibold">{meta.page}</span> of{" "}
              <span className="font-semibold">{meta.totalPages}</span> ({meta.total} total)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={meta.page <= 1 || loading}
                onClick={() =>
                  void fetchUsers({
                    page: meta.page - 1,
                    search,
                    role: roleFilter,
                    status: statusFilter,
                  })
                }
                className="text-xs py-1 px-3 h-auto"
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={meta.page >= meta.totalPages || loading}
                onClick={() =>
                  void fetchUsers({
                    page: meta.page + 1,
                    search,
                    role: roleFilter,
                    status: statusFilter,
                  })
                }
                className="text-xs py-1 px-3 h-auto"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
