/**
 * Theme token auditing helpers.
 *
 * These utilities parse the canonical token declarations out of
 * `src/styles.css` so tests can assert that every design token resolves to a
 * real value in BOTH light and dark mode, and that the teal/gold palette keeps
 * WCAG contrast on the surfaces it is painted on.
 *
 * Pure functions only — no DOM, no imports from app code — so they run in the
 * plain node vitest environment.
 */

export type Mode = "light" | "dark";

export interface ThemeTokenSets {
  /** Tokens declared on `:root` (light mode + shared base). */
  root: Record<string, string>;
  /** Tokens declared on `.dark` (overrides only). */
  dark: Record<string, string>;
  /** Tokens declared inside `@theme inline` (Tailwind utility mapping). */
  theme: Record<string, string>;
}

const BLOCK_PATTERNS: Array<{ key: keyof ThemeTokenSets; pattern: RegExp }> = [
  { key: "theme", pattern: /@theme\s+inline\s*\{/ },
  { key: "root", pattern: /(^|\})\s*:root\s*\{/ },
  { key: "dark", pattern: /(^|\})\s*\.dark\s*\{/ },
];

/** Extract the body of the first top-level block matching `pattern`. */
function extractBlock(css: string, pattern: RegExp): string {
  const match = pattern.exec(css);
  if (!match) return "";
  let depth = 0;
  const start = css.indexOf("{", match.index);
  for (let i = start; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start + 1, i);
    }
  }
  return "";
}

/** Parse `--name: value;` declarations, ignoring nested rules and comments. */
export function parseDeclarations(block: string): Record<string, string> {
  const stripped = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}

export function parseThemeTokens(css: string): ThemeTokenSets {
  const sets = { root: {}, dark: {}, theme: {} } as ThemeTokenSets;
  for (const { key, pattern } of BLOCK_PATTERNS) {
    sets[key] = parseDeclarations(extractBlock(css, pattern));
  }
  return sets;
}

/** Token maps for a given mode: `.dark` values shadow `:root` values. */
export function tokensForMode(sets: ThemeTokenSets, mode: Mode): Record<string, string> {
  return mode === "dark" ? { ...sets.root, ...sets.dark } : { ...sets.root };
}

const VAR_RE = /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*))?\)/i;

/**
 * Resolve `var()` chains for a token to a literal CSS value.
 * Throws when a referenced token does not exist in the mode (dangling token).
 */
export function resolveToken(
  tokens: Record<string, string>,
  name: string,
  seen: string[] = [],
): string {
  const raw = tokens[name];
  if (raw === undefined) {
    throw new Error(`token ${name} is not declared (chain: ${[...seen, name].join(" → ")})`);
  }
  if (seen.includes(name)) {
    throw new Error(`token ${name} is circular (chain: ${[...seen, name].join(" → ")})`);
  }
  return resolveValue(tokens, raw, [...seen, name]);
}

export function resolveValue(
  tokens: Record<string, string>,
  value: string,
  seen: string[] = [],
): string {
  let out = value.trim();
  let guard = 0;
  while (VAR_RE.test(out)) {
    if ((guard += 1) > 30) throw new Error(`unresolvable value: ${value}`);
    const m = VAR_RE.exec(out)!;
    const [full, ref, fallback] = m as unknown as [string, string, string | undefined];
    let replacement: string;
    if (tokens[ref] !== undefined) {
      replacement = resolveToken(tokens, ref, seen);
    } else if (fallback !== undefined) {
      replacement = resolveValue(tokens, fallback, seen);
    } else {
      throw new Error(
        `token ${ref} referenced by "${value}" is not declared (chain: ${seen.join(" → ")})`,
      );
    }
    out = out.replace(full, replacement).trim();
  }
  return out;
}

/* ── Color math ──────────────────────────────────────────────────────────── */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse hex (#rgb/#rrggbb/#rrggbbaa), rgb()/rgba() and a few CSS keywords. */
export function parseColor(input: string): Rgba {
  const value = input.trim().toLowerCase();
  const keywords: Record<string, string> = {
    white: "#ffffff",
    black: "#000000",
    transparent: "rgba(0,0,0,0)",
  };
  const resolved = keywords[value] ?? value;

  if (resolved.startsWith("#")) {
    const hex = resolved.slice(1);
    const expand = (h: string) => parseInt(h.length === 1 ? h + h : h, 16);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]!),
        g: expand(hex[1]!),
        b: expand(hex[2]!),
        a: hex.length === 4 ? expand(hex[3]!) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(resolved);
  if (fn) {
    const parts = fn[1]!.split(/[\s,/]+/).filter(Boolean);
    const num = (raw: string) =>
      raw.endsWith("%") ? (parseFloat(raw) / 100) * 255 : parseFloat(raw);
    return {
      r: num(parts[0]!),
      g: num(parts[1]!),
      b: num(parts[2]!),
      a: parts[3] === undefined ? 1 : parseFloat(parts[3].replace("%", "")) / (parts[3].endsWith("%") ? 100 : 1),
    };
  }

  throw new Error(`unsupported color value: ${input}`);
}

/** Composite a possibly translucent color over an opaque backdrop. */
export function flatten(color: Rgba, backdrop: Rgba): Rgba {
  const a = Math.min(Math.max(color.a, 0), 1);
  return {
    r: color.r * a + backdrop.r * (1 - a),
    g: color.g * a + backdrop.g * (1 - a),
    b: color.b * a + backdrop.b * (1 - a),
    a: 1,
  };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
  );
}

/** WCAG 2.1 contrast ratio between two colors (alpha composited first). */
export function contrastRatio(
  foreground: string | Rgba,
  background: string | Rgba,
  base: string | Rgba = "#ffffff",
): number {
  const baseRgb = typeof base === "string" ? parseColor(base) : base;
  const bgRgb = flatten(typeof background === "string" ? parseColor(background) : background, baseRgb);
  const fgRgb = flatten(typeof foreground === "string" ? parseColor(foreground) : foreground, bgRgb);
  const l1 = relativeLuminance(fgRgb);
  const l2 = relativeLuminance(bgRgb);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
