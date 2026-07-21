import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { logRuntimeError } from "@/lib/runtime-error-logger";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  component: AdminGate,
});

function AdminGate() {
  const { user, loading, isAdmin } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user && !isAdmin) {
      void logRuntimeError({
        kind: "rbac",
        severity: "warning",
        message: `Non-admin user attempted to access /admin (${user.email})`,
        actorRole: user.roles.join(","),
        meta: { gate: "_admin", allowed: "admin_roles" },
      });
    } else if (!user) {
      void logRuntimeError({
        kind: "rbac",
        severity: "info",
        message: "Unauthenticated visitor blocked from /admin",
        meta: { gate: "_admin" },
      });
    }
  }, [loading, user, isAdmin]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream text-emerald-deep">
        <p className="text-xs uppercase tracking-widest">Loading portal…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" />;
  if (!isAdmin) return <Navigate to="/app" />;
  return <Outlet />;
}
