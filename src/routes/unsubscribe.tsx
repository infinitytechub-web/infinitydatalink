import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";

const search = z.object({
  token: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: zodValidator(search),
  head: () => ({
    meta: [
      { title: "Unsubscribe — Infinity Wealth" },
      { name: "description", content: "Manage your Infinity Wealth email preferences." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<"loading" | "confirm" | "already" | "invalid" | "done" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.valid) setState("confirm");
        else if (body.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  const confirm = async () => {
    try {
      const r = await fetch(`/email/unsubscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await r.json();
      if (body.success) setState("done");
      else if (body.reason === "already_unsubscribed") setState("already");
      else {
        setError(body.error ?? "Unsubscribe failed");
        setState("error");
      }
    } catch (e: any) {
      setError(e?.message ?? "Network error");
      setState("error");
    }
  };

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-emerald-deep/10 bg-card p-8 shadow-sm">
        <h1 className="font-serif text-2xl text-emerald-deep">Email preferences</h1>
        <p className="mt-2 text-sm text-emerald-deep/60">
          Manage your Infinity Wealth email subscription.
        </p>
        <div className="mt-6 text-sm text-emerald-deep/80">
          {state === "loading" && "Validating your link…"}
          {state === "invalid" && (
            <p className="text-red-600">This unsubscribe link is invalid or has expired.</p>
          )}
          {state === "already" && <p>You've already been unsubscribed. No further emails will be sent.</p>}
          {state === "confirm" && (
            <div className="space-y-4">
              <p>Click below to confirm you want to stop receiving emails from Infinity Wealth.</p>
              <button
                onClick={confirm}
                className="rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid"
              >
                Confirm unsubscribe
              </button>
            </div>
          )}
          {state === "done" && (
            <p className="text-emerald-mid">You've been unsubscribed. We're sorry to see you go.</p>
          )}
          {state === "error" && <p className="text-red-600">{error}</p>}
        </div>
      </div>
    </main>
  );
}
