import { Link } from "@tanstack/react-router";
import { useBranding } from "@/components/branding-provider";

/** Admin-branded logo + app name used across the authentication pages. */
export function AuthBrandMark({ className = "" }: { className?: string }) {
  const { branding } = useBranding();
  const appName = branding.app_name || "IT-360 CashApp";

  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      {branding.logo_url ? (
        <img
          src={branding.logo_url}
          alt={appName}
          className="h-9 w-9 rounded-md object-contain"
        />
      ) : (
        <div className="flex size-9 items-center justify-center rounded-md bg-emerald-deep shadow-sm">
          <div className="size-3 rotate-45 border-2 border-gold" />
        </div>
      )}
      <span className="font-serif text-lg tracking-tight text-emerald-deep">{appName}</span>
    </Link>
  );
}
