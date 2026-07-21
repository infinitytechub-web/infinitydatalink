// Supabase-backed auth context with RBAC. Roles come from the `user_roles` table.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "super_admin"
  | "compliance_officer"
  | "loan_officer"
  | "finance_officer"
  | "auditor"
  | "member";

export type Permission =
  | "export:members"
  | "export:loans"
  | "export:savings"
  | "export:payments"
  | "export:security"
  | "export:audit"
  | "export:approvals"
  | "export:own_transactions"
  | "export:own_loans"
  | "export:own_savings"
  | "export:own_statement"
  | "loans:decide"
  | "members:manage";

export const ADMIN_ROLE_LABEL: Record<Exclude<AppRole, "member">, string> = {
  super_admin: "Super Admin",
  compliance_officer: "Compliance Officer",
  loan_officer: "Loan Officer",
  finance_officer: "Finance Officer",
  auditor: "Auditor",
};

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  super_admin: [
    "export:members", "export:loans", "export:savings", "export:payments",
    "export:security", "export:audit", "export:approvals",
    "loans:decide", "members:manage",
  ],
  compliance_officer: ["export:members", "export:audit", "export:security", "members:manage"],
  loan_officer: ["export:loans", "export:members", "export:approvals", "loans:decide"],
  finance_officer: ["export:savings", "export:payments", "export:loans", "export:approvals"],
  auditor: [
    "export:members", "export:loans", "export:savings", "export:payments",
    "export:security", "export:audit", "export:approvals",
  ],
  member: ["export:own_transactions", "export:own_loans", "export:own_savings", "export:own_statement"],
};

const ADMIN_ROLES: AppRole[] = [
  "super_admin", "compliance_officer", "loan_officer", "finance_officer", "auditor",
];

export type AccountStatus = "pending" | "approved" | "rejected" | "deactivated";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  roles: AppRole[];
  status: AccountStatus;
  rejectionReason: string | null;
};

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  permissions: Permission[];
  isMember: boolean;
  isAdmin: boolean;
  hasRole: (r: AppRole) => boolean;
  hasPermission: (p: Permission) => boolean;
  hasAnyPermission: (ps: Permission[]) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

async function loadRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error || !data) return [];
  return data.map((r) => r.role as AppRole);
}

async function loadStatus(userId: string): Promise<{ status: AccountStatus; rejectionReason: string | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("status, rejection_reason")
    .eq("id", userId)
    .maybeSingle();
  return {
    status: ((data as any)?.status ?? "pending") as AccountStatus,
    rejectionReason: ((data as any)?.rejection_reason ?? null) as string | null,
  };
}

function toSessionUser(
  u: User,
  roles: AppRole[],
  status: AccountStatus,
  rejectionReason: string | null,
): SessionUser {
  return {
    id: u.id,
    email: u.email ?? "",
    fullName:
      (u.user_metadata?.full_name as string | undefined) ??
      (u.email?.split("@")[0] ?? "Member"),
    roles: roles.length ? roles : ["member"],
    status,
    rejectionReason,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = async (authUser: User | null) => {
    if (!authUser) {
      setUser(null);
      return;
    }
    const [roles, statusInfo] = await Promise.all([loadRoles(authUser.id), loadStatus(authUser.id)]);
    setUser(toSessionUser(authUser, roles, statusInfo.status, statusInfo.rejectionReason));
  };

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      await hydrate(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      // Defer to avoid deadlock inside the callback.
      setTimeout(() => {
        void hydrate(session?.user ?? null);
      }, 0);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const permissions = useMemo<Permission[]>(() => {
    if (!user) return [];
    const set = new Set<Permission>();
    for (const r of user.roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
    return Array.from(set);
  }, [user]);

  const hasRole = (r: AppRole) => !!user?.roles.includes(r);
  const isMember = !!user?.roles.includes("member");
  const isAdmin = !!user?.roles.some((r) => ADMIN_ROLES.includes(r));
  const hasPermission = (p: Permission) => permissions.includes(p);
  const hasAnyPermission = (ps: Permission[]) => ps.some((p) => permissions.includes(p));

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    await hydrate(data.session?.user ?? null);
  };

  return (
    <AuthCtx.Provider
      value={{
        user, loading, permissions, isMember, isAdmin,
        hasRole, hasPermission, hasAnyPermission, signOut, refresh,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Excellent"] as const;
  return { score: s as 0 | 1 | 2 | 3 | 4, label: labels[s] };
}
