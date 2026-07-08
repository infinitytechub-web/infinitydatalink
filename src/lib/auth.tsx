import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "member" | "admin";
export type SessionUser = { name: string; email: string; role: Role };

type AuthState = {
  user: SessionUser | null;
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
    setUser(u);
    window.localStorage.setItem(KEY, JSON.stringify(u));
  };
  const logout = () => {
    setUser(null);
    window.localStorage.removeItem(KEY);
  };

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
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
