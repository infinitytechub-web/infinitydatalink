import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { passwordStrength } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Infinity Wealth" },
      {
        name: "description",
        content:
          "Sign in or create your Infinity Wealth account to access savings, loans, and payments in your member or administrator portal.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sign in — Infinity Wealth" },
      {
        property: "og:description",
        content:
          "Access your Infinity Wealth member or administrator portal to manage savings, loans, and payments.",
      },
      { property: "og:url", content: "https://infinity-wealth360.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://infinity-wealth360.lovable.app/auth" }],
  }),
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

const signUpSchema = signInSchema.extend({
  fullName: z.string().min(2, "Enter your full name"),
});

type Mode = "signin" | "signup";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <div className="min-h-screen bg-cream font-sans text-emerald-deep">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
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

      <div className="mx-auto grid max-w-2xl gap-8 px-6 pb-16">
        <div className="rounded-sm border border-emerald-deep/5 bg-card p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/50">
                Member & Administrator portal
              </p>
              <h2 className="mt-1 font-serif text-2xl text-emerald-deep">
                {mode === "signin" ? "Sign in to your account" : "Create your account"}
              </h2>
            </div>
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-[11px] font-bold uppercase tracking-widest text-emerald-mid hover:underline"
            >
              {mode === "signin" ? "Create account" : "Have an account? Sign in"}
            </button>
          </div>

          <AuthForm mode={mode} />

          <div className="my-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/40">
            <div className="h-px flex-1 bg-emerald-deep/10" /> or <div className="h-px flex-1 bg-emerald-deep/10" />
          </div>

          <GoogleButton />

          <p className="mt-6 text-[11px] text-emerald-deep/50">
            Administrator roles are assigned by an existing Super Admin from the admin console.
            New accounts start with Member permissions.
          </p>
        </div>
      </div>
    </div>
  );
}

function AuthForm({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const parsed = signUpSchema.safeParse({ email, password, fullName });
        if (!parsed.success) {
          setErr(parsed.error.issues[0]?.message ?? "Invalid input");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { full_name: fullName },
          },
        });
        if (error) {
          setErr(error.message);
          return;
        }
        navigate({ to: "/app" });
      } else {
        const parsed = signInSchema.safeParse({ email, password });
        if (!parsed.success) {
          setErr(parsed.error.issues[0]?.message ?? "Invalid input");
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setErr(error.message);
          return;
        }
        // Wait a tick for auth state to hydrate roles, then route.
        setTimeout(() => navigate({ to: "/app" }), 100);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {mode === "signup" ? (
        <Field label="Full name">
          <input
            type="text"
            required
            autoComplete="name"
            className={inputClass()}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ada Lovelace"
          />
        </Field>
      ) : null}
      <Field label="Email">
        <input
          type="email"
          required
          autoComplete="email"
          className={inputClass()}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>
      <Field
        label="Password"
        hint={
          mode === "signin" ? (
            <Link to="/auth/forgot" className="text-[11px] font-medium text-emerald-mid hover:underline">
              Forgot password?
            </Link>
          ) : null
        }
      >
        <input
          type="password"
          required
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className={inputClass()}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
        {password && mode === "signup" ? (
          <div className="mt-2">
            <div className="h-1 w-full overflow-hidden rounded-full bg-emerald-deep/10">
              <div
                className={cn(
                  "h-full transition-all",
                  strength.score <= 1 ? "bg-destructive" : strength.score === 2 ? "bg-gold" : "bg-emerald-mid",
                )}
                style={{ width: `${(strength.score / 4) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-emerald-deep/50">
              Strength: {strength.label}
            </p>
          </div>
        ) : null}
      </Field>

      {err ? <p className="text-xs font-medium text-destructive">{err}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-emerald-deep py-3 text-xs font-bold uppercase tracking-widest text-cream transition-colors hover:bg-emerald-mid disabled:opacity-60"
      >
        {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}

function GoogleButton() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    setErr(null);
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) setErr(result.error.message || "Google sign-in failed");
      if (result.redirected) return;
      // In-preview flow: session set. Navigate.
      window.location.assign("/app");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded border border-emerald-deep/15 bg-white py-3 text-xs font-bold uppercase tracking-widest text-emerald-deep transition-colors hover:bg-cream disabled:opacity-60"
      >
        <GoogleIcon /> {loading ? "Connecting…" : "Continue with Google"}
      </button>
      {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/60">
          {label}
        </span>
        {hint}
      </div>
      {children}
    </label>
  );
}

function inputClass() {
  return "w-full rounded border border-emerald-deep/15 bg-white px-3 py-2.5 text-sm text-emerald-deep outline-none transition-colors placeholder:text-emerald-deep/30 focus:border-emerald-mid";
}
