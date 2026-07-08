import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Role = "member" | "admin";

// Admin sub-roles with granular permissions used across admin modules.
export type AdminRole =
  | "super_admin"
  | "compliance_officer"
  | "loan_officer"
  | "finance_officer"
  | "auditor";

export type Permission =
  | "export:members"
  | "export:loans"
  | "export:savings"
  | "export:payments"
  | "export:security"
  | "export:audit"
  | "export:approvals";

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  compliance_officer: "Compliance Officer",
  loan_officer: "Loan Officer",
  finance_officer: "Finance Officer",
  auditor: "Auditor",
};

// Permission matrix. Auditor has read-only export access to everything.
// Super admin owns everything. Others get scoped exports.
export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [
    "export:members",
    "export:loans",
    "export:savings",
    "export:payments",
    "export:security",
    "export:audit",
    "export:approvals",
  ],
  compliance_officer: ["export:members", "export:audit", "export:security"],
  loan_officer: ["export:loans", "export:members", "export:approvals"],
  finance_officer: ["export:savings", "export:payments", "export:loans", "export:approvals"],
  auditor: [
    "export:members",
    "export:loans",
    "export:savings",
    "export:payments",
    "export:security",
    "export:audit",
    "export:approvals",
  ],
};

export type SessionUser = {
  name: string;
  email: string;
  role: Role;
  adminRole?: AdminRole;
};

type AuthState = {
  user: SessionUser | null;
  permissions: Permission[];
  hasPermission: (p: Permission) => boolean;
  hasAnyPermission: (ps: Permission[]) => boolean;
  login: (u: SessionUser) => void;
  logout: () => void;
};

const KEY = "iw:session";
const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const login = (u: SessionUser) => {
    // Default admin sessions to super_admin if none specified.
    const withRole: SessionUser =
      u.role === "admin" && !u.adminRole ? { ...u, adminRole: "super_admin" } : u;
    setUser(withRole);
    window.localStorage.setItem(KEY, JSON.stringify(withRole));
  };
  const logout = () => {
    setUser(null);
    window.localStorage.removeItem(KEY);
  };

  const permissions = useMemo<Permission[]>(() => {
    if (!user || user.role !== "admin" || !user.adminRole) return [];
    return ADMIN_ROLE_PERMISSIONS[user.adminRole] ?? [];
  }, [user]);

  const hasPermission = (p: Permission) => permissions.includes(p);
  const hasAnyPermission = (ps: Permission[]) => ps.some((p) => permissions.includes(p));

  return (
    <AuthCtx.Provider
      value={{ user, permissions, hasPermission, hasAnyPermission, login, logout }}
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

// Lockout tracker
export function recordLoginAttempt(email: string, ok: boolean): { locked: boolean; remaining: number } {
  const k = `iw:lockout:${email}`;
  if (ok) {
    window.localStorage.removeItem(k);
    return { locked: false, remaining: 3 };
  }
  const n = Number(window.localStorage.getItem(k) ?? "0") + 1;
  window.localStorage.setItem(k, String(n));
  return { locked: n >= 3, remaining: Math.max(0, 3 - n) };
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
