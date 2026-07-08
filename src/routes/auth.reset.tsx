import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { passwordStrength } from "@/lib/auth";

export const Route = createFileRoute("/auth/reset")({
  head: () => ({
    meta: [
      { title: "Set new password — Infinity Wealth" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const strength = passwordStrength(pw);
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 font-sans">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (strength.score < 3) return setErr("Choose a stronger password");
          if (pw !== pw2) return setErr("Passwords don't match");
          const { supabase } = await import("@/integrations/supabase/client");
          const { error } = await supabase.auth.updateUser({ password: pw });
          if (error) return setErr(error.message);
          nav({ to: "/auth" });
        }}
        className="w-full max-w-md space-y-4 rounded-sm border border-emerald-deep/5 bg-card p-8 shadow-sm"
      >
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/50">
          Set new password
        </p>
        <h1 className="font-serif text-2xl text-emerald-deep">Choose a strong password</h1>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="New password"
          className="w-full rounded border border-emerald-deep/15 px-3 py-2.5 text-sm outline-none focus:border-emerald-mid"
        />
        <div className="h-1 w-full overflow-hidden rounded-full bg-emerald-deep/10">
          <div
            className="h-full bg-emerald-mid transition-all"
            style={{ width: `${(strength.score / 4) * 100}%` }}
          />
        </div>
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder="Confirm password"
          className="w-full rounded border border-emerald-deep/15 px-3 py-2.5 text-sm outline-none focus:border-emerald-mid"
        />
        {err ? <p className="text-xs text-destructive">{err}</p> : null}
        <button className="w-full rounded bg-emerald-deep py-3 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid">
          Update password
        </button>
        <Link
          to="/auth"
          className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-mid hover:underline"
        >
          ← Back to sign in
        </Link>
      </form>
    </div>
  );
}
