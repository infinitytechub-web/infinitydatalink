/**
 * Centralized bright theme tokens.
 *
 * Single source of truth for gradient accents used across dashboard cards,
 * badges, and the left-nav so the palette stays consistent everywhere.
 * Add or reorder tones here; every consumer picks up the change.
 */

export type ToneName =
  | "teal"
  | "indigo"
  | "amber"
  | "rose"
  | "emerald"
  | "violet"
  | "sky";

export type ToneStyle = {
  /** Full gradient background (dark-on-light readable, used for KPI stat tiles). */
  bg: string;
  /** Matching outline ring for the tile. */
  ring: string;
  /** Label text on the tile. */
  label: string;
  /** Big value text on the tile. */
  value: string;
  /** Hint / footnote text on the tile. */
  hint: string;
  /** Thin gradient bar (top-of-card accent). */
  bar: string;
  /** Compact gradient (icon tiles / dots for sidebar). */
  chip: string;
};

export const KPI_TONES: Record<ToneName, ToneStyle> = {
  teal: {
    bg: "bg-linear-to-br from-teal-500 via-teal-600 to-cyan-700",
    ring: "ring-teal-400/40",
    label: "text-teal-50/90",
    value: "text-white",
    hint: "text-teal-50/80",
    bar: "bg-linear-to-r from-teal-500 via-cyan-500 to-sky-500",
    chip: "from-teal-400 to-cyan-500",
  },
  indigo: {
    bg: "bg-linear-to-br from-indigo-500 via-indigo-600 to-violet-700",
    ring: "ring-indigo-400/40",
    label: "text-indigo-50/90",
    value: "text-white",
    hint: "text-indigo-50/80",
    bar: "bg-linear-to-r from-indigo-500 via-violet-500 to-fuchsia-500",
    chip: "from-indigo-400 to-violet-500",
  },
  amber: {
    bg: "bg-linear-to-br from-amber-400 via-orange-500 to-rose-500",
    ring: "ring-amber-300/50",
    label: "text-amber-50/95",
    value: "text-white",
    hint: "text-amber-50/85",
    bar: "bg-linear-to-r from-amber-400 via-orange-500 to-rose-500",
    chip: "from-amber-400 to-orange-500",
  },
  rose: {
    bg: "bg-linear-to-br from-rose-500 via-pink-600 to-fuchsia-700",
    ring: "ring-rose-400/40",
    label: "text-rose-50/90",
    value: "text-white",
    hint: "text-rose-50/80",
    bar: "bg-linear-to-r from-rose-500 via-pink-500 to-fuchsia-500",
    chip: "from-rose-400 to-pink-500",
  },
  emerald: {
    bg: "bg-linear-to-br from-emerald-500 via-emerald-600 to-teal-700",
    ring: "ring-emerald-400/40",
    label: "text-emerald-50/90",
    value: "text-white",
    hint: "text-emerald-50/80",
    bar: "bg-linear-to-r from-emerald-500 via-teal-500 to-cyan-500",
    chip: "from-emerald-400 to-teal-500",
  },
  violet: {
    bg: "bg-linear-to-br from-violet-500 via-purple-600 to-fuchsia-700",
    ring: "ring-violet-400/40",
    label: "text-violet-50/90",
    value: "text-white",
    hint: "text-violet-50/80",
    bar: "bg-linear-to-r from-violet-500 via-purple-500 to-fuchsia-500",
    chip: "from-violet-400 to-purple-500",
  },
  sky: {
    bg: "bg-linear-to-br from-sky-500 via-blue-600 to-indigo-700",
    ring: "ring-sky-400/40",
    label: "text-sky-50/90",
    value: "text-white",
    hint: "text-sky-50/80",
    bar: "bg-linear-to-r from-sky-500 via-blue-500 to-indigo-500",
    chip: "from-sky-400 to-blue-500",
  },
};

/** Deterministic tone rotation for lists of cards / nav groups. */
export const TONE_CYCLE: ToneName[] = [
  "teal",
  "indigo",
  "emerald",
  "amber",
  "rose",
  "violet",
  "sky",
];

export const pickTone = (i: number): ToneName =>
  TONE_CYCLE[((i % TONE_CYCLE.length) + TONE_CYCLE.length) % TONE_CYCLE.length];

/** Section header gradient bar accents — reuse tone.bar. */
export const SECTION_ACCENT = (tone: ToneName | "none"): string =>
  tone === "none" ? "hidden" : KPI_TONES[tone].bar;

/** Sidebar per-group tint (chip gradient + dot). */
export const SIDEBAR_GROUP_CHIPS: string[] = TONE_CYCLE.map(
  (t) => KPI_TONES[t].chip,
);

/** Status pill tokens — bright, high-contrast semantic badges. */
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
    "bg-linear-to-r from-emerald-500 to-teal-500 text-white ring-1 ring-emerald-300/50 shadow-[0_4px_10px_-4px_rgba(16,185,129,0.6)]",
  approved:
    "bg-linear-to-r from-emerald-500 to-teal-500 text-white ring-1 ring-emerald-300/50 shadow-[0_4px_10px_-4px_rgba(16,185,129,0.6)]",
  active:
    "bg-linear-to-r from-teal-500 to-cyan-500 text-white ring-1 ring-teal-300/50 shadow-[0_4px_10px_-4px_rgba(20,184,166,0.6)]",
  pending:
    "bg-linear-to-r from-amber-400 to-orange-500 text-white ring-1 ring-amber-300/50 shadow-[0_4px_10px_-4px_rgba(245,158,11,0.6)]",
  failed:
    "bg-linear-to-r from-rose-500 to-red-600 text-white ring-1 ring-rose-300/50 shadow-[0_4px_10px_-4px_rgba(244,63,94,0.6)]",
  rejected:
    "bg-linear-to-r from-rose-500 to-red-600 text-white ring-1 ring-rose-300/50 shadow-[0_4px_10px_-4px_rgba(244,63,94,0.6)]",
  closed:
    "bg-linear-to-r from-slate-500 to-slate-600 text-white ring-1 ring-slate-300/40",
};

/**
 * Semantic text tone tokens for inline numbers / labels (e.g. KPI counts,
 * SLA text). Prefer these over hardcoded `text-red-*` / `text-emerald-*`.
 */
export const TEXT_TONE = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  muted: "text-muted-foreground",
  neutral: "text-foreground",
} as const;

/**
 * Semantic button token classes — bright fintech gradients that match the
 * status pill family so destructive/confirm buttons feel like the badges.
 */
export const BUTTON_TONE = {
  danger:
    "bg-linear-to-r from-rose-500 to-red-600 text-white ring-1 ring-rose-300/50 shadow-[0_4px_10px_-4px_rgba(244,63,94,0.6)] hover:brightness-110",
  success:
    "bg-linear-to-r from-emerald-500 to-teal-500 text-white ring-1 ring-emerald-300/50 shadow-[0_4px_10px_-4px_rgba(16,185,129,0.6)] hover:brightness-110",
  primary:
    "bg-linear-to-r from-teal-500 to-cyan-500 text-white ring-1 ring-teal-300/50 shadow-[0_4px_10px_-4px_rgba(20,184,166,0.6)] hover:brightness-110",
} as const;

/**
 * Chart palette derived from the bright tone system so recharts series
 * match the KPI tiles and section accents. Consumed by `chartPalette` in
 * `src/components/charts.tsx`.
 */
export const CHART_PALETTE: string[] = [
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
  "#f59e0b", // amber-500
  "#f43f5e", // rose-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#0ea5e9", // sky-500
];

