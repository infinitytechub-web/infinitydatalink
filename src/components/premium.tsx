/**
 * Premium presentation widgets — colorful gradient stat cards, sparklines,
 * progress rings and glass widget shells used across the analytics and
 * executive dashboards. All colors come from tone tokens / CSS variables so
 * light and dark mode both stay legible.
 */
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { KPI_TONES, CHART_PALETTE, type ToneName } from "@/lib/theme-tokens";

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  className,
  stroke = "currentColor",
  height = 34,
}: {
  values: readonly number[];
  className?: string;
  stroke?: string;
  height?: number;
}) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 100;
  const h = 32;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${coords.join(" L")}`;
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ height }}
      className={cn("w-full overflow-visible", className)}
    >
      <path d={area} fill={stroke} opacity={0.18} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Delta badge                                                         */
/* ------------------------------------------------------------------ */

export function DeltaBadge({
  value,
  label,
  invert,
  onDark = true,
}: {
  /** Fractional change, e.g. 0.082 for +8.2%. */
  value: number;
  label?: string;
  /** When true, a rise is bad (arrears, cancellations). */
  invert?: boolean;
  onDark?: boolean;
}) {
  const up = value > 0.0005;
  const down = value < -0.0005;
  const good = invert ? down : up;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : ArrowRight;
  const text = `${up ? "+" : ""}${(value * 100).toFixed(1)}%`;
  const tone = onDark
    ? good
      ? "bg-white/20 text-white ring-white/30"
      : up || down
        ? "bg-black/25 text-white ring-white/20"
        : "bg-white/15 text-white ring-white/20"
    : good
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300"
      : up || down
        ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300"
        : "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ring-1 backdrop-blur",
        tone,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {text}
      {label ? <span className="font-medium opacity-80">{label}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Premium stat card                                                   */
/* ------------------------------------------------------------------ */

export function PremiumStatCard({
  label,
  value,
  hint,
  tone = "royal",
  icon,
  delta,
  deltaLabel,
  deltaInvert,
  spark,
  progress,
  className,
  onActivate,
  tooltip,
  actionLabel,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: ToneName;
  icon?: ReactNode;
  delta?: number;
  deltaLabel?: string;
  deltaInvert?: boolean;
  spark?: readonly number[];
  /** 0..1 — renders a thin progress meter at the card foot. */
  progress?: number;
  className?: string;
  /** When provided the card becomes a keyboard-operable button (drill-down). */
  onActivate?: () => void;
  /** Native tooltip text explaining the metric. */
  tooltip?: string;
  /** Accessible name suffix, e.g. "View underlying deposits". */
  actionLabel?: string;
}) {
  const t = KPI_TONES[tone];
  const interactive = typeof onActivate === "function";
  return (
    <div
      {...(interactive
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": `${label}${actionLabel ? ` — ${actionLabel}` : " — view details"}`,
            onClick: onActivate,
            onKeyDown: (e: ReactKeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate!();
              }
            },
          }
        : {})}
      title={tooltip}
      className={cn(
        "group relative isolate overflow-hidden rounded-2xl p-5 ring-1",
        "shadow-[0_14px_36px_-18px_rgba(15,23,42,0.45)]",
        "motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out",
        "motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_26px_52px_-20px_rgba(15,23,42,0.55)]",
        interactive &&
          "cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        t.bg,
        t.ring,
        className,
      )}
    >
      {/* luminous accents */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-14 -top-16 size-44 rounded-full bg-white/20 blur-3xl motion-safe:transition-opacity motion-safe:duration-500 group-hover:opacity-80"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-12 size-44 rounded-full bg-black/15 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,rgba(255,255,255,0.22),transparent_60%)]"
      />
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1 opacity-90", t.bar)} />

      <div className="relative flex items-start justify-between gap-3">
        <p className={cn("text-[10.5px] font-semibold uppercase tracking-[0.16em]", t.label)}>
          {label}
        </p>
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl bg-white/18 ring-1 ring-white/25 backdrop-blur",
              t.value,
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <h2
        className={cn(
          "relative mt-3 font-display text-[1.75rem] font-bold leading-tight tracking-tight tabular-nums",
          "drop-shadow-[0_1px_0_rgba(0,0,0,0.14)]",
          t.value,
        )}
      >
        {value}
      </h2>

      {typeof delta === "number" ? (
        <div className="relative mt-2">
          <DeltaBadge
            value={delta}
            label={deltaLabel}
            invert={deltaInvert}
            onDark={tone !== "gold"}
          />
        </div>
      ) : null}

      {spark && spark.length > 1 ? (
        <div className={cn("relative mt-3", t.value)}>
          <Sparkline values={spark} stroke="currentColor" />
        </div>
      ) : null}

      {typeof progress === "number" ? (
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-black/20">
          <div
            className="h-full rounded-full bg-white/85 motion-safe:transition-[width] motion-safe:duration-700"
            style={{ width: `${Math.min(100, Math.max(2, progress * 100)).toFixed(1)}%` }}
          />
        </div>
      ) : null}

      {hint ? (
        <div className={cn("relative mt-3 text-[11px] font-medium", t.hint)}>{hint}</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress ring / gauge                                               */
/* ------------------------------------------------------------------ */

export function ProgressRing({
  value,
  label,
  caption,
  tone = 0,
  size = 108,
  onActivate,
  tooltip,
}: {
  /** 0..1 */
  value: number;
  label: string;
  caption?: ReactNode;
  /** Index into the chart palette. */
  tone?: number;
  size?: number;
  /** When provided the gauge becomes a keyboard-operable drill-down trigger. */
  onActivate?: () => void;
  tooltip?: string;
}) {
  const pct = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const color = CHART_PALETTE[tone % CHART_PALETTE.length];
  const r = 42;
  const c = 2 * Math.PI * r;
  const interactive = typeof onActivate === "function";
  const Wrapper: any = interactive ? "button" : "div";
  return (
    <Wrapper
      {...(interactive
        ? {
            type: "button",
            onClick: onActivate,
            "aria-label": `${label} ${(pct * 100).toFixed(1)}% — view details`,
          }
        : {})}
      title={tooltip}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl p-2 text-center",
        interactive &&
          "cursor-pointer transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
      )}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          className="size-full -rotate-90"
          role="img"
          aria-label={`${label} ${(pct * 100).toFixed(1)}%`}
        >
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--chart-grid)" strokeWidth={9} />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-display text-lg font-bold tabular-nums text-foreground">
          {(pct * 100).toFixed(1)}%
        </span>
      </div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {caption ? <p className="text-[11px] text-muted-foreground">{caption}</p> : null}
    </Wrapper>
  );
}

/* ------------------------------------------------------------------ */
/* Glass widget shell + mini stat                                      */
/* ------------------------------------------------------------------ */

export function PremiumWidget({
  title,
  eyebrow,
  icon,
  action,
  tone = "royal",
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  action?: ReactNode;
  tone?: ToneName;
  children: ReactNode;
  className?: string;
}) {
  const t = KPI_TONES[tone];
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm backdrop-blur",
        "transition-shadow duration-200 hover:shadow-lg",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1 opacity-90", t.bar)} />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-linear-to-b from-muted/50 to-transparent px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <span
              aria-hidden="true"
              className={cn(
                "grid size-9 place-items-center rounded-xl bg-linear-to-br text-white shadow-sm",
                t.chip,
              )}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h3 className="truncate font-display text-base font-semibold tracking-tight text-foreground">
              {title}
            </h3>
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function MiniStat({
  label,
  value,
  tone = 0,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: number;
  hint?: ReactNode;
}) {
  const color = CHART_PALETTE[tone % CHART_PALETTE.length];
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card px-4 py-3">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: color }}
      />
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-bold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
