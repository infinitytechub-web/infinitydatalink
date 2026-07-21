import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { logRuntimeError } from "@/lib/runtime-error-logger";

export const Route = createFileRoute("/_member")({
  ssr: false,
  component: MemberGate,
});

function MemberGate() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void logRuntimeError({
        kind: "rbac",
        severity: "info",
        message: "Unauthenticated visitor blocked from /app",
        meta: { gate: "_member" },
      });
    }
  }, [loading, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream text-emerald-deep">
        <p className="text-xs uppercase tracking-widest">Loading portal…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" />;
  return <Outlet />;
}
