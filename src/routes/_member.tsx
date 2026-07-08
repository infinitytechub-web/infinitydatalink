import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_member")({
  component: MemberGate,
});

function MemberGate() {
  const { user } = useAuth();
  // Simple client-side gate. On refresh, auth restores from localStorage in effect.
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem("iw:session");
    if (!raw && !user) return <Navigate to="/auth" />;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.role !== "member") return <Navigate to="/auth" />;
    } else if (user && user.role !== "member") {
      return <Navigate to="/auth" />;
    }
  }
  return <Outlet />;
}
