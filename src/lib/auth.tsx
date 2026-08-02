// Supabase-backed auth context with RBAC. Roles come from the `user_roles` table.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

// The Supabase client (and the whole supabase-js runtime) is loaded lazily so
// public pages — landing, marketing routes — don't pay for it in the initial
// JS bundle. Every consumer here awaits `getSupabase()`.
type SupabaseModule = typeof import("@/integrations/supabase/client");
let supabasePromise: Promise<SupabaseModule["supabase"]> | null = null;
function getSupabase() {
  supabasePromise ??= import("@/integrations/supabase/client").then((m) => m.supabase);
  return supabasePromise;
}

export type AppRole =
  | "super_admin"
  | "admin"
  | "manager"
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
  admin: "Admin",
  manager: "Manager",
  compliance_officer: "Compliance Officer",
  loan_officer: "Loan Officer",
  finance_officer: "Finance Officer",
  auditor: "Auditor",
};

const ALL_EXPORTS: Permission[] = [
  "export:members", "export:loans", "export:savings", "export:payments",
  "export:security", "export:audit", "export:approvals",
];

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  super_admin: [...ALL_EXPORTS, "loans:decide", "members:manage"],
  admin: [...ALL_EXPORTS, "loans:decide", "members:manage"],
  manager: [...ALL_EXPORTS, "loans:decide", "members:manage"],
  compliance_officer: ["export:members", "export:audit", "export:security", "members:manage"],
  loan_officer: ["export:loans", "export:members", "export:approvals", "loans:decide"],
  finance_officer: ["export:savings", "export:payments", "export:loans", "export:approvals"],
  auditor: [...ALL_EXPORTS],
  member: ["export:own_transactions", "export:own_loans", "export:own_savings", "export:own_statement"],
};

const ADMIN_ROLES: AppRole[] = [
  "super_admin", "admin", "manager", "compliance_officer", "loan_officer", "finance_officer", "auditor",
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
  const supabase = await getSupabase();
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error || !data) {
    if (import.meta.env.DEV && error) {
      // Surface RLS / permission regressions during development — silent
      // failure in prod so we don't leak schema details in the console.
      console.warn("[auth] loadRoles failed:", error.message);
    }
    return [];
  }
  return data.map((r: { role: string }) => r.role as AppRole);
}

async function loadStatus(userId: string): Promise<{ status: AccountStatus; rejectionReason: string | null }> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("status, rejection_reason")
    .eq("id", userId)
    .maybeSingle();
  if (import.meta.env.DEV && error) {
    console.warn("[auth] loadStatus failed:", error.message);
  }
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
  // Track the last authenticated user id we hydrated so USER_UPDATED
  // events (email/metadata edits) don't trigger duplicate roles+profile
  // fetches every time Supabase refreshes the token.
  const lastHydratedId = useRef<string | null>(null);

  const hydrate = async (authUser: User | null, opts: { force?: boolean } = {}) => {
    if (!authUser) {
      lastHydratedId.current = null;
      setUser(null);
      return;
    }
    if (!opts.force && lastHydratedId.current === authUser.id) {
      // Same signed-in user — skip the roles/profile round-trip.
      return;
    }
    lastHydratedId.current = authUser.id;
    const [roles, statusInfo] = await Promise.all([loadRoles(authUser.id), loadStatus(authUser.id)]);
    setUser(toSessionUser(authUser, roles, statusInfo.status, statusInfo.rejectionReason));
  };

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      const supabase = await getSupabase();
      if (cancelled) return;

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await hydrate(data.session?.user ?? null, { force: true });
      if (cancelled) return;
      setLoading(false);

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        // Defer to avoid deadlock inside the callback.
        setTimeout(() => {
          void hydrate(session?.user ?? null);
        }, 0);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      if (cancelled) unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const permissions = useMemo<Permission[]>(() => {
    if (!user) return [];
    const set = new Set<Permission>();
    for (const r of user.roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
    return Array.from(set);
  }, [user]);

  const value = useMemo<AuthState>(() => {
    const hasRole = (r: AppRole) => !!user?.roles.includes(r);
    const isMember = !!user?.roles.includes("member");
    const isAdmin = !!user?.roles.some((r) => ADMIN_ROLES.includes(r));
    const hasPermission = (p: Permission) => permissions.includes(p);
    const hasAnyPermission = (ps: Permission[]) => ps.some((p) => permissions.includes(p));
    const signOut = async () => {
      const supabase = await getSupabase();
      await supabase.auth.signOut();
      setUser(null);
    };
    const refresh = async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.auth.getSession();
      await hydrate(data.session?.user ?? null);
    };
    return {
      user, loading, permissions, isMember, isAdmin,
      hasRole, hasPermission, hasAnyPermission, signOut, refresh,
    };
  }, [user, loading, permissions]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
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
