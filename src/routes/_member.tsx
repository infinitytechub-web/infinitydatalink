import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_member")({
  component: MemberGate,
});

function MemberGate() {
  const { user, loading } = useAuth();
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
