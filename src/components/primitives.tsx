import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/org-config";
import { Skeleton } from "@/components/ui/skeleton";

export function KPIStat({
  label,
  value,
  hint,
  accent,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border p-6",
        "shadow-[var(--shadow-elevated)]",
        "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
        "motion-safe:hover:-translate-y-0.5",
        accent
          ? "border-primary/30 bg-linear-to-br from-primary/10 via-card to-card"
          : "border-border bg-card",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 h-px",
          accent
            ? "bg-linear-to-r from-transparent via-primary to-transparent"
            : "bg-linear-to-r from-transparent via-border to-transparent",
        )}
      />
      <p
        className={cn(
          "mb-2 text-[11px] font-semibold uppercase tracking-widest",
          accent ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <h2 className="font-serif text-3xl text-foreground">{value}</h2>
      {hint ? <div className="mt-4 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function Money({ amount, signed }: { amount: number; signed?: boolean }) {
  const sign = signed ? (amount > 0 ? "+ " : amount < 0 ? "- " : "") : "";
  const abs = signed ? Math.abs(amount) : amount;
  return (
    <span className="tabular">
      {sign}
      {formatMoney(abs)}
    </span>
  );
}

export function StatusPill({
  status,
}: {
  status: "cleared" | "closed" | "pending" | "failed" | "approved" | "rejected" | "active";
}) {
  const map: Record<string, string> = {
    cleared: "bg-primary/10 text-primary ring-1 ring-primary/20",
    closed: "bg-muted text-muted-foreground ring-1 ring-border",
    approved: "bg-primary/10 text-primary ring-1 ring-primary/20",
    active: "bg-primary/10 text-primary ring-1 ring-primary/20",
    pending: "bg-warning/10 text-warning ring-1 ring-warning/20",
    failed: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
    rejected: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-elevated)]",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-6">
        <h3 className="font-serif text-lg text-foreground">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="truncate font-serif text-2xl text-foreground sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/40 p-12 text-center">
      <p className="font-serif text-lg text-foreground">{title}</p>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
