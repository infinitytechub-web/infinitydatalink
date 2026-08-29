/**
 * Maps admin-configured branding colors (primary / secondary / accent) onto the
 * live shadcn design tokens so buttons, focus rings, links and sidebar accents
 * all follow the selected system branding — in both light and dark mode.
 *
 * Nothing here hardcodes a palette: every value is derived from the three
 * branding hex colors, with readable foregrounds picked by contrast ratio.
 */

export type BrandPaletteInput = {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
};

const STYLE_ID = "brand-palette-tokens";

type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb | null {
  const raw = hex.trim().replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Blend `color` toward `target` by `amount` (0..1). */
function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

function lighten(color: Rgb, amount: number) {
  return mix(color, WHITE, amount);
}
function darken(color: Rgb, amount: number) {
  return mix(color, BLACK, amount);
}

function luminance({ r, g, b }: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Readable text color on top of `bg` — near-white or near-black, whichever wins. */
function readableOn(bg: Rgb): string {
  const light: Rgb = { r: 255, g: 255, b: 255 };
  const dark: Rgb = { r: 12, g: 20, b: 33 };
  return contrast(bg, light) >= contrast(bg, dark) ? toHex(light) : toHex(dark);
}

/**
 * Nudge `color` toward `target` until it clears `min` contrast against
 * `against`. Keeps admin-chosen brand colors usable as both fills (white/near
 * black label on top) and as text on the page surface.
 */
export function ensureContrast(color: Rgb, against: Rgb, min: number, target: Rgb): Rgb {
  let out = color;
  for (let step = 0; step < 20 && contrast(out, against) < min; step += 1) {
    out = mix(out, target, 0.08);
  }
  return out;
}

function rgbTriplet({ r, g, b }: Rgb): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

function declarations(entries: Array<[string, string]>): string {
  return entries.map(([k, v]) => `${k}: ${v};`).join("");
}

/**
 * Builds the CSS text that overrides theme tokens for `:root` (light) and
 * `.dark`. Returns an empty string when no color parses, so the static
 * stylesheet defaults stay in charge.
 */
export function buildBrandPaletteCss(input: BrandPaletteInput): string {
  const primary = parseHex(input.primary_color);
  const secondary = parseHex(input.secondary_color);
  const accent = parseHex(input.accent_color);
  if (!primary) return "";

  const brandVars: Array<[string, string]> = [
    ["--brand-primary", toHex(primary)],
    ["--brand-primary-rgb", rgbTriplet(primary)],
  ];
  if (secondary) {
    brandVars.push(["--brand-secondary", toHex(secondary)], ["--brand-secondary-rgb", rgbTriplet(secondary)]);
  }
  if (accent) {
    brandVars.push(["--brand-accent", toHex(accent)], ["--brand-accent-rgb", rgbTriplet(accent)]);
  }

  // Light mode: primary as-is; secondary surfaces are a soft tint of the
  // secondary brand color so secondary buttons stay legible.
  const lightSecondarySurface = secondary ? lighten(secondary, 0.88) : null;
  const light: Array<[string, string]> = [
    ...brandVars,
    ["--primary", toHex(primary)],
    ["--primary-foreground", readableOn(primary)],
    ["--ring", rgba(primary, 0.45)],
    ["--sidebar-ring", toHex(primary)],
  ];
  if (lightSecondarySurface) {
    light.push(
      ["--secondary", toHex(lightSecondarySurface)],
      ["--secondary-foreground", readableOn(lightSecondarySurface)],
    );
  }
  if (accent) {
    light.push(
      ["--sidebar-primary", toHex(accent)],
      ["--sidebar-primary-foreground", readableOn(accent)],
    );
  }

  // Dark mode: lift the primary so it keeps contrast against dark surfaces,
  // and keep secondary surfaces as a translucent wash of the brand color.
  const darkPrimary = luminance(primary) < 0.25 ? lighten(primary, 0.28) : primary;
  const dark: Array<[string, string]> = [
    ...brandVars,
    ["--primary", toHex(darkPrimary)],
    ["--primary-foreground", readableOn(darkPrimary)],
    ["--ring", rgba(lighten(primary, 0.35), 0.55)],
    ["--sidebar-ring", toHex(lighten(primary, 0.3))],
  ];
  if (secondary) {
    dark.push(
      ["--secondary", rgba(lighten(secondary, 0.2), 0.16)],
      ["--secondary-foreground", "#e6edf6"],
    );
  }
  if (accent) {
    const darkAccent = lighten(accent, 0.12);
    dark.push(
      ["--sidebar-primary", toHex(darkAccent)],
      ["--sidebar-primary-foreground", readableOn(darkAccent)],
    );
  }

  return `:root{${declarations(light)}}\n.dark{${declarations(dark)}}`;
}

/** Injects (or updates) the branded palette stylesheet in <head>. */
export function applyBrandPalette(input: BrandPaletteInput): void {
  if (typeof document === "undefined") return;
  const css = buildBrandPaletteCss(input);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/** Small helper for previews: swatch text color for a given background hex. */
export function readableTextFor(hex: string): string {
  const rgb = parseHex(hex);
  return rgb ? readableOn(rgb) : "#0c1421";
}
