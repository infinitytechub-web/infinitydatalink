import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { ADMIN_ROLE_LABEL, passwordStrength, recordLoginAttempt, useAuth, type AdminRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Infinity Wealth" },
      { name: "description", content: "Sign in to your Infinity Wealth member or administrator portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

function AuthPage() {
  return (
    <div className="min-h-screen bg-cream font-sans text-emerald-deep">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-sm bg-emerald-deep">
            <div className="size-3 rotate-45 border-2 border-gold" />
          </div>
          <span className="font-serif text-lg">Infinity Wealth</span>
        </Link>
        <span className="text-[11px] uppercase tracking-widest text-emerald-deep/50">
          Secure session · TLS 1.3
        </span>
      </header>

      <div className="mx-auto grid max-w-6xl gap-0 px-6 pb-16 md:grid-cols-2 md:gap-8">
        <LoginPanel role="member" />
        <LoginPanel role="admin" />
      </div>
    </div>
  );
}

function LoginPanel({ role }: { role: "member" | "admin" }) {
  const isAdmin = role === "admin";
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(3);
  const [adminRole, setAdminRole] = useState<AdminRole>("super_admin");

  const strength = useMemo(() => passwordStrength(password), [password]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    if (isAdmin && otp.length !== 6) {
      setErr("Enter your 6-digit 2FA code");
      return;
    }
    // Mock authentication — any valid-shape credential succeeds
    const ok = true;
    const state = recordLoginAttempt(email, ok);
    if (!ok) {
      setRemaining(state.remaining);
      setErr(state.locked ? "Account locked. Contact support." : `Invalid credentials · ${state.remaining} left`);
      return;
    }
    login({
      name: email.split("@")[0].replace(/\W/g, " ") || (isAdmin ? "Admin" : "Member"),
      email,
      role,
      ...(isAdmin ? { adminRole } : {}),
    });
    navigate({ to: isAdmin ? "/admin" : "/app" });
  };

  return (
    <div
      className={cn(
        "rounded-sm border p-8 shadow-sm",
        isAdmin ? "border-emerald-deep bg-emerald-deep text-cream" : "border-emerald-deep/5 bg-card",
      )}
    >
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-widest",
          isAdmin ? "text-gold" : "text-emerald-deep/50",
        )}
      >
        {isAdmin ? "Administrator" : "Member"} portal
      </p>
      <h2 className={cn("mt-1 font-serif text-2xl", isAdmin ? "text-cream" : "text-emerald-deep")}>
        {isAdmin ? "Institutional access" : "Sign in to your account"}
      </h2>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <Field label="Email" isDark={isAdmin}>
          <input
            type="email"
            required
            autoComplete="email"
            className={inputClass(isAdmin)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={isAdmin ? "admin@institution.com" : "you@example.com"}
          />
        </Field>

        <Field
          label="Password"
          isDark={isAdmin}
          hint={
            !isAdmin ? (
              <Link to="/auth/forgot" className="text-[11px] font-medium text-emerald-mid hover:underline">
                Forgot password?
              </Link>
            ) : null
          }
        >
          <input
            type="password"
            required
            autoComplete="current-password"
            className={inputClass(isAdmin)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          {password ? (
            <div className="mt-2">
              <div className={cn("h-1 w-full overflow-hidden rounded-full", isAdmin ? "bg-white/10" : "bg-emerald-deep/10")}>
                <div
                  className={cn(
                    "h-full transition-all",
                    strength.score <= 1 ? "bg-destructive" : strength.score === 2 ? "bg-gold" : "bg-emerald-mid",
                  )}
                  style={{ width: `${(strength.score / 4) * 100}%` }}
                />
              </div>
              <p className={cn("mt-1 text-[10px] uppercase tracking-widest", isAdmin ? "text-white/50" : "text-emerald-deep/50")}>
                Strength: {strength.label}
              </p>
            </div>
          ) : null}
        </Field>

        {isAdmin ? (
          <>
            <Field label="Administrator role" isDark>
              <select
                className={inputClass(true)}
                value={adminRole}
                onChange={(e) => setAdminRole(e.target.value as AdminRole)}
              >
                {(Object.keys(ADMIN_ROLE_LABEL) as AdminRole[]).map((r) => (
                  <option key={r} value={r} className="text-emerald-deep">
                    {ADMIN_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="2FA Code" isDark>
              <input
                inputMode="numeric"
                maxLength={6}
                className={inputClass(true)}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="123 456"
              />
            </Field>
          </>
        ) : null}

        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 text-xs",
            isAdmin ? "text-white/70" : "text-emerald-deep/70",
          )}
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-3.5 accent-gold"
          />
          Remember this device
        </label>

        {err ? (
          <p className="text-xs font-medium text-destructive">{err}</p>
        ) : (
          <p className={cn("text-[10px] uppercase tracking-widest", isAdmin ? "text-white/40" : "text-emerald-deep/40")}>
            {remaining} attempts before lockout
          </p>
        )}

        <button
          type="submit"
          className={cn(
            "w-full rounded py-3 text-xs font-bold uppercase tracking-widest transition-colors",
            isAdmin
              ? "bg-gold text-emerald-deep hover:opacity-90"
              : "bg-emerald-deep text-cream hover:bg-emerald-mid",
          )}
        >
          {isAdmin ? "Authenticate administrator" : "Sign in"}
        </button>
      </form>

      <p
        className={cn(
          "mt-6 text-[10px] uppercase tracking-widest",
          isAdmin ? "text-white/40" : "text-emerald-deep/50",
        )}
      >
        {isAdmin
          ? "Access is logged, geo-tracked and audited."
          : "New member? Registration requires administrator approval."}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
  isDark,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  isDark?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label
          className={cn(
            "text-[10px] font-semibold uppercase tracking-widest",
            isDark ? "text-white/50" : "text-emerald-deep/50",
          )}
        >
          {label}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}

function inputClass(isDark: boolean) {
  return cn(
    "w-full rounded border px-3 py-2.5 text-sm outline-none transition-colors font-sans",
    isDark
      ? "border-white/15 bg-white/5 text-cream placeholder:text-white/30 focus:border-gold"
      : "border-emerald-deep/15 bg-card text-emerald-deep placeholder:text-emerald-deep/30 focus:border-emerald-mid",
  );
}
