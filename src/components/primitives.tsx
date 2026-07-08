import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/org-config";

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
        "rounded-sm border p-6 shadow-sm",
        accent
          ? "border-gold/30 bg-gold/5"
          : "border-emerald-deep/5 bg-card",
        className,
      )}
    >
      <p
        className={cn(
          "mb-1 text-[11px] font-semibold uppercase tracking-widest",
          accent ? "text-gold" : "text-emerald-deep/50",
        )}
      >
        {label}
      </p>
      <h2 className="font-serif text-3xl text-emerald-deep">{value}</h2>
      {hint ? <div className="mt-4 text-[11px] text-emerald-deep/60">{hint}</div> : null}
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
  status: "cleared" | "pending" | "failed" | "approved" | "rejected" | "active";
}) {
  const map: Record<string, string> = {
    cleared: "bg-emerald-mid/10 text-emerald-mid",
    approved: "bg-emerald-mid/10 text-emerald-mid",
    active: "bg-emerald-mid/10 text-emerald-mid",
    pending: "bg-gold/10 text-gold",
    failed: "bg-destructive/10 text-destructive",
    rejected: "bg-destructive/10 text-destructive",
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
        "overflow-hidden border border-emerald-deep/5 bg-card shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between border-b border-emerald-deep/5 p-6">
        <h3 className="font-serif text-lg">{title}</h3>
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
    <div className="flex items-end justify-between gap-6">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/50">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-serif text-3xl text-emerald-deep">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-emerald-deep/60">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-emerald-deep/15 bg-cream/40 p-12 text-center">
      <p className="font-serif text-lg text-emerald-deep">{title}</p>
      {hint ? <p className="mt-2 text-xs text-emerald-deep/50">{hint}</p> : null}
    </div>
  );
}
