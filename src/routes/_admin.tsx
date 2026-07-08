import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_admin")({
  component: AdminGate,
});

function AdminGate() {
  const { user } = useAuth();
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem("iw:session");
    if (!raw && !user) return <Navigate to="/auth" />;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.role !== "admin") return <Navigate to="/auth" />;
    } else if (user && user.role !== "admin") {
      return <Navigate to="/auth" />;
    }
  }
  return <Outlet />;
}
