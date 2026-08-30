import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthBrandMark } from "@/components/auth-brand-mark";

export const Route = createFileRoute("/auth/forgot")({
  head: () => ({
    meta: [{ title: "Reset password — IT-360 CashApp" }, { name: "robots", content: "noindex" }],
  }),
  component: Forgot,
});

function Forgot() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 font-sans">
      <div className="w-full max-w-md rounded-sm border border-emerald-deep/5 bg-card p-8 shadow-sm">
        <AuthBrandMark className="mb-6" />
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Password reset
        </p>
        <h1 className="mt-1 font-serif text-2xl text-emerald-deep">Recover your account</h1>
        {sent ? (
          <p className="mt-6 text-sm text-muted-foreground">
            If <span className="font-mono">{email}</span> is registered, we've sent a reset link.
            Please check your inbox.
          </p>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const { supabase } = await import("@/integrations/supabase/client");
              await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/reset`,
              });
              setSent(true);
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-emerald-deep/15 bg-card px-3 py-2.5 text-sm outline-none focus:border-emerald-mid"
              placeholder="you@example.com"
            />
            <button className="w-full rounded bg-emerald-deep py-3 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid">
              Send reset link
            </button>
          </form>
        )}
        <Link
          to="/auth"
          className="mt-6 inline-block text-[11px] font-semibold uppercase tracking-widest text-emerald-mid hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
