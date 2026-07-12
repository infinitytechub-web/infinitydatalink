import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/org-config";
import { Skeleton } from "@/components/ui/skeleton";

export type KPITone = "teal" | "indigo" | "amber" | "rose" | "emerald" | "violet" | "sky";

const TONE_STYLES: Record<KPITone, { bg: string; ring: string; label: string; value: string; hint: string; bar: string }> = {
  teal:    { bg: "bg-linear-to-br from-teal-500 via-teal-600 to-cyan-700",       ring: "ring-teal-400/40",    label: "text-teal-50/90",    value: "text-white", hint: "text-teal-50/80",    bar: "bg-linear-to-r from-white/0 via-white/70 to-white/0" },
  indigo:  { bg: "bg-linear-to-br from-indigo-500 via-indigo-600 to-violet-700", ring: "ring-indigo-400/40",  label: "text-indigo-50/90",  value: "text-white", hint: "text-indigo-50/80",  bar: "bg-linear-to-r from-white/0 via-white/70 to-white/0" },
  amber:   { bg: "bg-linear-to-br from-amber-400 via-orange-500 to-rose-500",    ring: "ring-amber-300/50",   label: "text-amber-50/95",   value: "text-white", hint: "text-amber-50/85",   bar: "bg-linear-to-r from-white/0 via-white/80 to-white/0" },
  rose:    { bg: "bg-linear-to-br from-rose-500 via-pink-600 to-fuchsia-700",    ring: "ring-rose-400/40",    label: "text-rose-50/90",    value: "text-white", hint: "text-rose-50/80",    bar: "bg-linear-to-r from-white/0 via-white/70 to-white/0" },
  emerald: { bg: "bg-linear-to-br from-emerald-500 via-emerald-600 to-teal-700", ring: "ring-emerald-400/40", label: "text-emerald-50/90", value: "text-white", hint: "text-emerald-50/80", bar: "bg-linear-to-r from-white/0 via-white/70 to-white/0" },
  violet:  { bg: "bg-linear-to-br from-violet-500 via-purple-600 to-fuchsia-700",ring: "ring-violet-400/40",  label: "text-violet-50/90",  value: "text-white", hint: "text-violet-50/80",  bar: "bg-linear-to-r from-white/0 via-white/70 to-white/0" },
  sky:     { bg: "bg-linear-to-br from-sky-500 via-blue-600 to-indigo-700",      ring: "ring-sky-400/40",     label: "text-sky-50/90",     value: "text-white", hint: "text-sky-50/80",     bar: "bg-linear-to-r from-white/0 via-white/70 to-white/0" },
};

const TONE_CYCLE: KPITone[] = ["teal", "indigo", "emerald", "amber", "rose", "violet", "sky"];
export const kpiTone = (i: number): KPITone => TONE_CYCLE[i % TONE_CYCLE.length];

export function KPIStat({
  label,
  value,
  hint,
  accent,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  tone?: KPITone;
  className?: string;
}) {
  const resolvedTone: KPITone = tone ?? (accent ? "amber" : "teal");
  const t = TONE_STYLES[resolvedTone];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl p-6 ring-1",
        "shadow-[0_18px_40px_-18px_rgba(2,24,30,0.45)]",
        "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
        "motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_28px_60px_-20px_rgba(2,24,30,0.55)]",
        t.bg,
        t.ring,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/20 blur-2xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -left-10 size-40 rounded-full bg-black/15 blur-2xl"
      />
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5", t.bar)} />
      <p className={cn("mb-2 text-[11px] font-semibold uppercase tracking-widest", t.label)}>
        {label}
      </p>
      <h2 className={cn("font-serif text-3xl drop-shadow-[0_1px_0_rgba(0,0,0,0.15)]", t.value)}>{value}</h2>
      {hint ? <div className={cn("mt-4 text-[11px]", t.hint)}>{hint}</div> : null}
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
  accent = "teal",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: "teal" | "indigo" | "amber" | "rose" | "emerald" | "violet" | "sky" | "none";
}) {
  const accents: Record<string, string> = {
    teal:    "bg-linear-to-r from-teal-500 via-cyan-500 to-sky-500",
    indigo:  "bg-linear-to-r from-indigo-500 via-violet-500 to-fuchsia-500",
    amber:   "bg-linear-to-r from-amber-400 via-orange-500 to-rose-500",
    rose:    "bg-linear-to-r from-rose-500 via-pink-500 to-fuchsia-500",
    emerald: "bg-linear-to-r from-emerald-500 via-teal-500 to-cyan-500",
    violet:  "bg-linear-to-r from-violet-500 via-purple-500 to-fuchsia-500",
    sky:     "bg-linear-to-r from-sky-500 via-blue-500 to-indigo-500",
    none:    "hidden",
  };
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card",
        "shadow-[0_12px_30px_-12px_rgba(2,24,30,0.35)]",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", accents[accent])} />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-linear-to-b from-muted/60 to-transparent p-6 pt-7">
        <h3 className="font-serif text-lg font-semibold text-foreground">{title}</h3>
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

export function EmptyState({
  title,
  hint,
  icon,
  action,
  className,
}: {
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-10 text-center",
        className,
      )}
      role="status"
    >
      <div className="grid size-11 place-items-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border">
        {icon ?? <Inbox className="size-5" aria-hidden="true" />}
      </div>
      <p className="font-serif text-lg text-foreground">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/**
 * Consistent error surface for `errorComponent` and inline failures.
 * Pairs a red iconography accent with a retry affordance.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center",
        className,
      )}
    >
      <div className="grid size-11 place-items-center rounded-full bg-background text-destructive shadow-sm ring-1 ring-destructive/30">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <p className="font-serif text-lg text-foreground">{title}</p>
      {message ? (
        <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm motion-safe:transition-colors hover:bg-muted"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Skeleton shaped to match `KPIStat`. */
export function KPIStatSkeleton({ accent }: { accent?: boolean } = {}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "relative overflow-hidden rounded-xl border p-6",
        "shadow-[var(--shadow-elevated)]",
        accent ? "border-primary/30 bg-linear-to-br from-primary/5 via-card to-card" : "border-border bg-card",
      )}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-border to-transparent" />
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="mt-4 h-3 w-40" />
    </div>
  );
}

/** Grid of KPI skeletons matching a typical 2/4-col dashboard row. */
export function KPIGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section
      aria-label="Loading key figures"
      className={cn(
        "grid gap-6",
        count === 2 ? "md:grid-cols-2" : count === 3 ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <KPIStatSkeleton key={i} accent={i === count - 1} />
      ))}
    </section>
  );
}

/** Shape-matched skeleton for tables inside a `SectionCard`. */
export function TableSkeleton({
  rows = 6,
  cols = 4,
  showHeader = true,
}: {
  rows?: number;
  cols?: number;
  showHeader?: boolean;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="w-full">
      {showHeader ? (
        <div
          className="grid gap-3 border-b border-border px-6 py-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
        >
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
      ) : null}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-3 px-6 py-4"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn("h-4", c === 0 ? "w-36" : c === cols - 1 ? "w-16 justify-self-end" : "w-24")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Whole SectionCard skeleton — mirrors the real card's frame. */
export function SectionCardSkeleton({
  title,
  rows = 5,
  cols = 4,
}: {
  title?: string;
  rows?: number;
  cols?: number;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-elevated)]">
      <header className="flex items-center justify-between border-b border-border p-6">
        {title ? (
          <h3 className="font-serif text-lg text-foreground">{title}</h3>
        ) : (
          <Skeleton className="h-5 w-40" />
        )}
        <Skeleton className="h-8 w-24" />
      </header>
      <TableSkeleton rows={rows} cols={cols} />
    </section>
  );
}

