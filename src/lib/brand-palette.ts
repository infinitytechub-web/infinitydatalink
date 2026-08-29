/**
 * Canonical brand ramp for the dark-green / teal / gold identity.
 *
 * These are the same values declared as CSS custom properties in
 * `src/styles.css` (`--brand-*`). Import from here whenever a hex value is
 * needed in TypeScript (meta theme-color, branding defaults, chart fallbacks);
 * in markup prefer the generated Tailwind utilities: `bg-brand-forest`,
 * `from-brand-teal`, `text-brand-gold`, …
 */
export const BRAND = {
  forestDeep: "#04140f",
  forest: "#06231d",
  forestSoft: "#0a251f",
  tealDeep: "#0f5f57",
  teal: "#0f766e",
  tealBright: "#0d9488",
  tealGlow: "#2dd4bf",
  goldDeep: "#d4a72c",
  gold: "#f5c451",
  goldLight: "#ffdc8a",
} as const;

/** Default admin-configurable branding colors, derived from the ramp. */
export const BRAND_DEFAULT_COLORS = {
  primary_color: BRAND.teal,
  secondary_color: BRAND.tealBright,
  accent_color: BRAND.gold,
} as const;

/** Meta `theme-color` per color scheme. */
export const BRAND_THEME_COLOR = {
  light: BRAND.teal,
  dark: BRAND.forestDeep,
} as const;
