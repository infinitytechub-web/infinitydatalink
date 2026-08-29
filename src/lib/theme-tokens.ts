/**
 * Centralized enterprise theme tokens.
 *
 * Palette: Deep Royal Blue primary, Emerald secondary, Gold accent. Tones
 * remain colorful for KPI tiles and sidebar chips but sit on the enterprise
 * palette instead of the previous saturated fintech gradients.
 */

export type ToneName =
  | "royal"
  | "emerald"
  | "gold"
  | "sky"
  | "violet"
  | "rose"
  | "slate"
  // Legacy aliases kept for backwards compatibility with existing consumers.
  | "teal"
  | "indigo"
  | "amber";

export type ToneStyle = {
  bg: string;
  ring: string;
  label: string;
  value: string;
  hint: string;
  bar: string;
  chip: string;
};

const BASE_TONES = {
  royal: {
    bg: "bg-linear-to-br from-brand-forest via-brand-teal to-brand-teal-bright",
    ring: "ring-brand-teal-bright/40",
    label: "text-blue-50/85",
    value: "text-white",
    hint: "text-blue-50/75",
    bar: "bg-linear-to-r from-brand-forest via-brand-teal to-brand-teal-bright",
    chip: "from-brand-forest to-brand-teal",
  },
  emerald: {
    bg: "bg-linear-to-br from-emerald-600 via-emerald-700 to-teal-800",
    ring: "ring-emerald-400/40",
    label: "text-emerald-50/85",
    value: "text-white",
    hint: "text-emerald-50/75",
    bar: "bg-linear-to-r from-emerald-500 via-teal-500 to-cyan-500",
    chip: "from-emerald-500 to-teal-600",
  },
  gold: {
    bg: "bg-linear-to-br from-[#b08a1e] via-[#d4a72c] to-[#f5c451]",
    ring: "ring-amber-300/50",
    label: "text-amber-50/95",
    value: "text-white",
    hint: "text-amber-50/85",
    bar: "bg-linear-to-r from-[#d4a72c] via-[#f5c451] to-[#ffd980]",
    chip: "from-[#d4a72c] to-[#f5c451]",
  },
  sky: {
    bg: "bg-linear-to-br from-sky-600 via-blue-700 to-indigo-800",
    ring: "ring-sky-400/40",
    label: "text-sky-50/85",
    value: "text-white",
    hint: "text-sky-50/75",
    bar: "bg-linear-to-r from-sky-500 via-blue-500 to-indigo-500",
    chip: "from-sky-500 to-blue-600",
  },
  violet: {
    bg: "bg-linear-to-br from-violet-600 via-purple-700 to-indigo-800",
    ring: "ring-violet-400/40",
    label: "text-violet-50/85",
    value: "text-white",
    hint: "text-violet-50/75",
    bar: "bg-linear-to-r from-violet-500 via-purple-500 to-fuchsia-500",
    chip: "from-violet-500 to-purple-600",
  },
  rose: {
    bg: "bg-linear-to-br from-rose-600 via-pink-700 to-fuchsia-800",
    ring: "ring-rose-400/40",
    label: "text-rose-50/85",
    value: "text-white",
    hint: "text-rose-50/75",
    bar: "bg-linear-to-r from-rose-500 via-pink-500 to-fuchsia-500",
    chip: "from-rose-500 to-pink-600",
  },
  slate: {
    bg: "bg-linear-to-br from-slate-700 via-slate-800 to-slate-900",
    ring: "ring-slate-400/30",
    label: "text-slate-100/85",
    value: "text-white",
    hint: "text-slate-100/75",
    bar: "bg-linear-to-r from-slate-500 via-slate-600 to-slate-700",
    chip: "from-slate-500 to-slate-700",
  },
} satisfies Record<string, ToneStyle>;

export const KPI_TONES: Record<ToneName, ToneStyle> = {
  ...BASE_TONES,
  teal: BASE_TONES.emerald,
  indigo: BASE_TONES.royal,
  amber: BASE_TONES.gold,
};



/** Deterministic tone rotation for lists of cards / nav groups. */
export const TONE_CYCLE: ToneName[] = [
  "royal",
  "emerald",
  "gold",
  "sky",
  "violet",
  "rose",
  "slate",
];

export const pickTone = (i: number): ToneName =>
  TONE_CYCLE[((i % TONE_CYCLE.length) + TONE_CYCLE.length) % TONE_CYCLE.length];

/** Section header gradient bar — reuse tone.bar. */
export const SECTION_ACCENT = (tone: ToneName | "none"): string =>
  tone === "none" ? "hidden" : KPI_TONES[tone].bar;

/** Sidebar per-group tint (chip gradient + dot). */
export const SIDEBAR_GROUP_CHIPS: string[] = TONE_CYCLE.map(
  (t) => KPI_TONES[t].chip,
);

/** Backwards-compat: keep old tone names ("teal", "indigo", "amber") mapping
 *  to the closest new tones so existing consumers keep working. */
export const LEGACY_TONE_MAP: Record<string, ToneName> = {
  teal: "emerald",
  indigo: "royal",
  amber: "gold",
  emerald: "emerald",
  violet: "violet",
  rose: "rose",
  sky: "sky",
};

/** Status pill tokens. */
export type StatusName =
  | "cleared"
  | "closed"
  | "pending"
  | "failed"
  | "approved"
  | "rejected"
  | "active";

export const STATUS_PILL: Record<StatusName, string> = {
  cleared:
    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  approved:
    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  active:
    "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  pending:
    "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  failed:
    "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  rejected:
    "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  closed:
    "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/30",
};

export const TEXT_TONE = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  muted: "text-muted-foreground",
  neutral: "text-foreground",
} as const;

export const BUTTON_TONE = {
  danger:
    "bg-linear-to-r from-rose-600 to-red-600 text-white shadow-sm ring-1 ring-rose-400/40 hover:brightness-110",
  success:
    "bg-linear-to-r from-emerald-600 to-teal-600 text-white shadow-sm ring-1 ring-emerald-400/40 hover:brightness-110",
  primary:
    "bg-linear-to-r from-brand-forest to-brand-teal text-white shadow-sm ring-1 ring-blue-400/40 hover:brightness-110",
} as const;

/** Chart palette — sourced from CSS variables so series colors flip with
 *  light/dark mode and stay legible on either surface. */
export const CHART_PALETTE: string[] = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
];
