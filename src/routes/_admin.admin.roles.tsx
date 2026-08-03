import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  ASSIGNABLE_ROLES,
  ROLE_PERMISSIONS,
  assignRole,
  bulkAssignRole,
  bulkRevokeRole,
  listUsersWithRoles,
  revokeRole,
  type AppRole,
  type AssignableRole,
  type UserWithRolesRow,
} from "@/lib/admin-role-management.functions";
import { Search, X } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/roles")({
  head: () => ({
    meta: [
      { title: "Roles & Permissions — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RolesPage,
});

const ALL_ROLES: AppRole[] = ["super_admin", ...ASSIGNABLE_ROLES, "member"];

const usersQuery = (search: string, role: string, page: number) =>
  queryOptions({
    queryKey: ["admin", "roles", "users", { search, role, page }],
    queryFn: () => listUsersWithRoles({ data: { search, role: role as any, page, pageSize: 25 } }),
  });

function RolesPage() {
  const { user, hasRole, can, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  if (!hasRole("super_admin") && !can("users", "view")) return <Navigate to="/admin" />;
  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Roles & Permissions"
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PermissionMatrixEditor />
      </Suspense>
      <div className="mt-6">
        <PermissionsMatrix />
      </div>
      <Suspense fallback={<Skeleton className="mt-6 h-96 w-full" />}>
        <UsersTable />
      </Suspense>
    </>
  );
}

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  compliance_officer: "Compliance Officer",
  loan_officer: "Loan Officer",
  finance_officer: "Finance Officer",
  auditor: "Auditor",
  member: "Member",
};

const ROLE_TONE: Record<AppRole, "success" | "warning" | "info" | "neutral" | "danger"> = {
  super_admin: "danger",
  admin: "danger",
  manager: "warning",
  compliance_officer: "info",
  loan_officer: "warning",
  finance_officer: "success",
  auditor: "neutral",
  member: "neutral",
};

const PERMISSION_CATEGORIES: Record<string, string[]> = {
  "Governance": [
    "Full system access",
    "Assign and revoke all roles (incl. super admin)",
    "Manage branding, settings, security centre",
    "View & export all audit logs",
    "No admin access",
  ],
  "Compliance & KYC": [
    "Review KYC submissions",
    "Approve / reject member verification",
  ],
  "Loans": [
    "Review loan applications",
    "Approve / reject / disburse loans",
    "View member savings & repayment history",
  ],
  "Finance": [
    "Post income, expenses & balance adjustments",
    "Approve transfers",
    "Access financial reports & exports",
  ],
  "Audit": [
    "Read-only access to all financial data",
    "View audit logs & exports",
    "Read audit logs",
  ],
  "Member": [
    "Manage own savings, loans, transfers",
    "Update own profile & KYC documents",
  ],
};

const ALL_CATEGORIES = Object.keys(PERMISSION_CATEGORIES);

function permissionCategory(permission: string): string | undefined {
  for (const [cat, perms] of Object.entries(PERMISSION_CATEGORIES)) {
    if (perms.includes(permission)) return cat;
  }
  return undefined;
}

function PermissionsMatrix() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredRoles = useMemo(() => {
    return ALL_ROLES.map((role) => {
      const matched = ROLE_PERMISSIONS[role].filter((p) => {
        const matchesText = !normalizedQuery || p.toLowerCase().includes(normalizedQuery);
        const matchesCategory = activeCategory === "All" || permissionCategory(p) === activeCategory;
        return matchesText && matchesCategory;
      });
      return { role, matched, visible: matched.length > 0 };
    }).filter((r) => r.visible);
  }, [normalizedQuery, activeCategory]);

  return (
    <SectionCard title="Effective permissions">
      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search permissions (e.g. KYC, loans, exports)..."
              className="w-full rounded-lg border border-emerald-deep/15 bg-white py-2 pl-9 pr-9 text-sm dark:bg-white/5"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-emerald-deep/10 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {["All", ...ALL_CATEGORIES].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider transition ${
                activeCategory === cat
                  ? "border-emerald-deep bg-emerald-deep text-white"
                  : "border-emerald-deep/20 bg-emerald-deep/10 text-emerald-deep hover:bg-emerald-deep/20"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredRoles.length === 0 ? (
          <EmptyState title="No permissions match" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredRoles.map(({ role, matched }) => (
              <div
                key={role}
                className="rounded-lg border border-emerald-deep/10 bg-white/60 p-4 dark:bg-white/5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{ROLE_LABEL[role]}</span>
                  <span className="rounded-full border border-emerald-deep/20 bg-emerald-deep/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">{role}</span>
                </div>
                <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
                  {matched.map((p) => {
                    const cat = permissionCategory(p);
                    const highlight = normalizedQuery && p.toLowerCase().includes(normalizedQuery);
                    return (
                      <li
                        key={p}
                        className={`${highlight ? "font-semibold text-emerald-deep" : ""}`}
                      >
                        {p}
                        {cat && (
                          <span className="ml-1.5 rounded border border-emerald-deep/10 bg-emerald-deep/5 px-1 py-0.5 text-[10px] text-slate-500">
                            {cat}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function UsersTable() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState<null | "assign" | "revoke">(null);
  const { data } = useSuspenseQuery(usersQuery(search, role, page));

  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / 25));
  const pageIds = data.rows.map((r) => r.user_id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  return (
    <SectionCard title="Team members">
      <div className="flex flex-wrap items-center gap-2 p-4">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name, email, or member no."
          className="min-w-64 flex-1 rounded border border-emerald-deep/15 bg-white px-3 py-2 text-sm dark:bg-white/5"
        />
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="rounded border border-emerald-deep/15 bg-white px-3 py-2 text-sm dark:bg-white/5"
        >
          <option value="all">All roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-emerald-deep/10 bg-emerald-deep/5 px-4 py-2 text-xs">
          <span className="font-semibold">{selected.size} selected</span>
          <button
            onClick={() => setBulkOpen("assign")}
            className="rounded bg-emerald-deep px-3 py-1 font-semibold uppercase tracking-widest text-white"
          >
            Bulk assign
          </button>
          <button
            onClick={() => setBulkOpen("revoke")}
            className="rounded border border-red-500/40 px-3 py-1 font-semibold uppercase tracking-widest text-red-600 hover:bg-red-500/10"
          >
            Bulk revoke
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto rounded border border-emerald-deep/15 px-3 py-1 uppercase tracking-widest"
          >
            Clear
          </button>
        </div>
      )}

      {data.rows.length === 0 ? (
        <EmptyState title="No users match" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-emerald-deep/5 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all on page"
                  />
                </th>
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Roles</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <UserRow
                  key={row.user_id}
                  row={row}
                  selected={selected.has(row.user_id)}
                  onToggle={() => toggle(row.user_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-emerald-deep/10 px-4 py-3 text-xs">
        <span>
          {data.total} user{data.total === 1 ? "" : "s"} • Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-emerald-deep/15 px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-emerald-deep/15 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {bulkOpen && (
        <BulkDialog
          mode={bulkOpen}
          userIds={Array.from(selected)}
          onClose={() => setBulkOpen(null)}
          onDone={() => {
            setBulkOpen(null);
            setSelected(new Set());
            qc.invalidateQueries({ queryKey: ["admin", "roles", "users"] });
          }}
        />
      )}
    </SectionCard>
  );
}

function UserRow({
  row,
  selected,
  onToggle,
}: {
  row: UserWithRolesRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-emerald-deep/10 hover:bg-emerald-deep/5">
        <td className="px-4 py-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${row.full_name ?? row.email ?? row.user_id}`}
          />
        </td>
        <td className="px-4 py-2">
          <div className="font-medium">{row.full_name ?? "—"}</div>
          <div className="text-xs text-slate-500">{row.member_no ?? "—"}</div>
        </td>
        <td className="px-4 py-2">{row.email ?? "—"}</td>
        <td className="px-4 py-2">
          <div className="flex flex-wrap gap-1">
            {row.roles.length === 0 ? (
              <span className="text-xs text-slate-400">no roles</span>
            ) : (
              row.roles.map((r) => (
                <span key={r} className="rounded-full border border-emerald-deep/20 bg-emerald-deep/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                  {ROLE_LABEL[r]}
                </span>
              ))
            )}
          </div>
        </td>
        <td className="px-4 py-2 text-right">
          <button
            onClick={() => setOpen(true)}
            className="rounded border border-emerald-deep/15 px-3 py-1 text-xs uppercase tracking-widest hover:bg-emerald-deep/5"
          >
            Manage
          </button>
        </td>
      </tr>
      {open && <ManageDialog row={row} onClose={() => setOpen(false)} />}
    </>
  );
}

function ManageDialog({ row, onClose }: { row: UserWithRolesRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<AssignableRole>(ASSIGNABLE_ROLES[0]);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const assignedNonSuper = useMemo(
    () => row.roles.filter((r): r is AssignableRole => (ASSIGNABLE_ROLES as readonly string[]).includes(r)),
    [row.roles],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "roles", "users"] });

  const assignMut = useMutation({
    mutationFn: (vars: { role: AssignableRole; note?: string }) =>
      assignRole({ data: { user_id: row.user_id, role: vars.role, note: vars.note } }),
    onSuccess: () => {
      toast.success("Role assigned");
      setNote("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to assign role"),
  });

  const revokeMut = useMutation({
    mutationFn: (vars: { role: AssignableRole; reason: string }) =>
      revokeRole({ data: { user_id: row.user_id, role: vars.role, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("Role revoked");
      setReason("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to revoke role"),
  });

  const effectivePermissions = Array.from(
    new Set(row.roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? [])),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage roles — {row.full_name ?? row.email}</DialogTitle>
          <DialogDescription>
            Super admin membership is managed on the Super Admins page. Member role is automatic.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Current roles
            </div>
            <div className="flex flex-wrap gap-2">
              {row.roles.length === 0 ? (
                <span className="text-xs text-slate-400">none</span>
              ) : (
                row.roles.map((r) => (
                  <span key={r} className="rounded-full border border-emerald-deep/20 bg-emerald-deep/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                    {ROLE_LABEL[r]}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="rounded border border-emerald-deep/10 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Assign role
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as AssignableRole)}
                className="rounded border border-emerald-deep/15 bg-white px-2 py-1 text-sm dark:bg-white/5"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="flex-1 rounded border border-emerald-deep/15 bg-white px-2 py-1 text-sm dark:bg-white/5"
              />
              <button
                disabled={assignMut.isPending || row.roles.includes(selectedRole)}
                onClick={() => assignMut.mutate({ role: selectedRole, note: note || undefined })}
                className="rounded bg-emerald-deep px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white disabled:opacity-40"
              >
                {row.roles.includes(selectedRole) ? "Already assigned" : "Assign"}
              </button>
            </div>
          </div>

          {assignedNonSuper.length > 0 && (
            <div className="rounded border border-red-500/20 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-500">
                Revoke role
              </div>
              <div className="space-y-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (required, min 3 chars)"
                  className="w-full rounded border border-emerald-deep/15 bg-white px-2 py-1 text-sm dark:bg-white/5"
                />
                <div className="flex flex-wrap gap-2">
                  {assignedNonSuper.map((r) => (
                    <button
                      key={r}
                      disabled={revokeMut.isPending || reason.trim().length < 3}
                      onClick={() => revokeMut.mutate({ role: r, reason })}
                      className="rounded border border-red-500/40 px-3 py-1 text-xs uppercase tracking-widest text-red-600 hover:bg-red-500/10 disabled:opacity-40"
                    >
                      Revoke {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Effective permissions
            </div>
            {effectivePermissions.length === 0 ? (
              <p className="text-xs text-slate-400">No permissions granted.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
                {effectivePermissions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded border border-emerald-deep/15 px-3 py-1 text-xs uppercase tracking-widest"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDialog({
  mode,
  userIds,
  onClose,
  onDone,
}: {
  mode: "assign" | "revoke";
  userIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState<AssignableRole>(ASSIGNABLE_ROLES[0]);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: string[]; failed: { user_id: string; error: string }[] } | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === "assign") {
        return bulkAssignRole({
          data: { user_ids: userIds, role: selectedRole, note: note || undefined },
        });
      }
      return bulkRevokeRole({
        data: { user_ids: userIds, role: selectedRole, reason },
      });
    },
    onSuccess: (res) => {
      setResult(res);
      const okN = res.ok.length;
      const failN = res.failed.length;
      if (failN === 0) toast.success(`${okN} user${okN === 1 ? "" : "s"} updated`);
      else toast.warning(`${okN} succeeded, ${failN} failed`);
    },
    onError: (e: any) => toast.error(e.message ?? "Bulk operation failed"),
  });

  const isRevoke = mode === "revoke";
  const canSubmit =
    !mut.isPending &&
    userIds.length > 0 &&
    (!isRevoke || reason.trim().length >= 3);

  return (
    <Dialog open onOpenChange={(o) => !o && (result ? onDone() : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isRevoke ? "Bulk revoke role" : "Bulk assign role"} — {userIds.length} user
            {userIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            {isRevoke
              ? "The role will be removed from every selected user who currently has it. Users without it are skipped by the database."
              : "The selected role will be granted to every selected user. Users who already have it are unchanged."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            <div className="rounded border border-emerald-deep/15 p-3">
              <div className="font-semibold text-emerald-deep">
                Succeeded: {result.ok.length}
              </div>
              <div className="font-semibold text-red-600">
                Failed: {result.failed.length}
              </div>
            </div>
            {result.failed.length > 0 && (
              <ul className="max-h-40 overflow-auto rounded border border-red-500/20 p-2 text-xs">
                {result.failed.map((f) => (
                  <li key={f.user_id} className="text-red-600">
                    <span className="font-mono">{f.user_id.slice(0, 8)}…</span> — {f.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as AssignableRole)}
                className="w-full rounded border border-emerald-deep/15 bg-white px-2 py-1 text-sm dark:bg-white/5"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            {isRevoke ? (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-red-500">
                  Reason (required, min 3 chars)
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded border border-emerald-deep/15 bg-white px-2 py-1 text-sm dark:bg-white/5"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Note (optional)
                </label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded border border-emerald-deep/15 bg-white px-2 py-1 text-sm dark:bg-white/5"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <button
              onClick={onDone}
              className="rounded bg-emerald-deep px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded border border-emerald-deep/15 px-3 py-1 text-xs uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                disabled={!canSubmit}
                onClick={() => mut.mutate()}
                className={`rounded px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white disabled:opacity-40 ${
                  isRevoke ? "bg-red-600" : "bg-emerald-deep"
                }`}
              >
                {mut.isPending ? "Working…" : isRevoke ? "Revoke" : "Assign"}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
