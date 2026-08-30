import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Capability, PermAction, PermModule } from "@/lib/permissions";

/**
 * Client-side capability gate for whole pages or individual blocks that expose
 * confidential data. Presentation only — the server functions and RLS remain
 * the authority; this simply avoids showing staff controls they cannot use.
 */
export function RequireCapability({
  cap,
  fallback,
  children,
}: {
  cap: Capability;
  /** Rendered instead of the children. Pass `null` to hide the block silently. */
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, hasRole } = useAuth();
  const [module, action] = cap.split(".") as [PermModule, PermAction];
  const allowed = hasRole("super_admin") || can(module, action);
  if (allowed) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  return <RestrictedNotice />;
}

export function RestrictedNotice({
  message = "You do not have permission to view this information.",
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center"
    >
      <ShieldAlert className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">Restricted</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
