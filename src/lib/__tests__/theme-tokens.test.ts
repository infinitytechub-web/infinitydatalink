import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildBrandPaletteCss } from "@/lib/brand-theme";

import { BRAND, BRAND_DEFAULT_COLORS, BRAND_THEME_COLOR } from "@/lib/brand-palette";
import {
  contrastRatio,
  parseColor,
  parseThemeTokens,
  resolveToken,
  resolveValue,
  round2,
  tokensForMode,
  type Mode,
} from "@/lib/theme-token-audit";

const CSS = readFileSync(path.resolve(__dirname, "../../styles.css"), "utf8");
const SETS = parseThemeTokens(CSS);
const MODES: Mode[] = ["light", "dark"];

/** Tokens that hold non-color values (fonts, radii, shadows, gradients). */
const NON_COLOR = /^--(radius|font|shadow|spacing|tracking|leading|animate|ease|duration)/;

describe("theme token declarations", () => {
  it("parses the canonical token blocks", () => {
    expect(Object.keys(SETS.root).length).toBeGreaterThan(40);
    expect(Object.keys(SETS.dark).length).toBeGreaterThan(20);
    expect(Object.keys(SETS.theme).length).toBeGreaterThan(30);
  });

  it("declares the brand ramp on :root only (dark mode reuses the same rungs)", () => {
    const ramp = Object.keys(SETS.root).filter((t) => t.startsWith("--brand-"));
    expect(ramp.length).toBeGreaterThanOrEqual(10);
    for (const token of ramp) {
      expect(SETS.dark[token], `${token} must not be redefined in .dark`).toBeUndefined();
      expect(() => parseColor(SETS.root[token]!)).not.toThrow();
    }
  });

  for (const mode of MODES) {
    describe(`${mode} mode`, () => {
      const tokens = tokensForMode(SETS, mode);

      it("resolves every declared token without dangling or circular vars", () => {
        for (const name of Object.keys(tokens)) {
          expect(() => resolveToken(tokens, name), `${name} in ${mode}`).not.toThrow();
        }
      });

      it("resolves every Tailwind @theme mapping to a real value", () => {
        for (const [name, value] of Object.entries(SETS.theme)) {
          expect(() => resolveValue(tokens, value), `${name} in ${mode}`).not.toThrow();
        }
      });

      it("resolves every color token to a parseable color", () => {
        for (const [name] of Object.entries(SETS.theme)) {
          if (NON_COLOR.test(name)) continue;
          const value = resolveValue(tokens, SETS.theme[name]!);
          if (
            value.includes("gradient") ||
            value.includes(",") === false ||
            value.startsWith("#")
          ) {
            expect(() => parseColor(value), `${name} in ${mode} = ${value}`).not.toThrow();
          } else {
            expect(() => parseColor(value), `${name} in ${mode} = ${value}`).not.toThrow();
          }
        }
      });
    });
  }

  it("keeps every semantic role defined in both modes", () => {
    const roles = [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--popover-foreground",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--secondary-foreground",
      "--muted",
      "--muted-foreground",
      "--accent",
      "--accent-foreground",
      "--destructive",
      "--destructive-foreground",
      "--border",
      "--input",
      "--ring",
      "--sidebar",
      "--sidebar-foreground",
      "--sidebar-primary",
      "--sidebar-primary-foreground",
      "--sidebar-accent",
      "--sidebar-accent-foreground",
      "--sidebar-border",
      "--sidebar-ring",
      "--success",
      "--warning",
      "--info",
      "--gold",
      "--chart-1",
      "--chart-2",
      "--chart-3",
      "--chart-grid",
      "--chart-axis",
    ];
    for (const role of roles) {
      expect(SETS.root[role], `${role} missing on :root`).toBeDefined();
      expect(SETS.dark[role], `${role} missing on .dark`).toBeDefined();
    }
  });
});

describe("brand palette parity (CSS ↔ TypeScript)", () => {
  const pairs: Array<[keyof typeof BRAND, string]> = [
    ["forestDeep", "--brand-forest-deep"],
    ["forest", "--brand-forest"],
    ["forestSoft", "--brand-forest-soft"],
    ["tealDeep", "--brand-teal-deep"],
    ["teal", "--brand-teal"],
    ["tealBright", "--brand-teal-bright"],
    ["tealGlow", "--brand-teal-glow"],
    ["goldDeep", "--brand-gold-deep"],
    ["gold", "--brand-gold"],
    ["goldLight", "--brand-gold-light"],
    ["goldInk", "--brand-gold-ink"],
  ];

  it.each(pairs)("BRAND.%s matches %s", (key, token) => {
    expect(BRAND[key].toLowerCase()).toBe(SETS.root[token]!.toLowerCase());
  });

  it("derives branding defaults and meta theme-color from the ramp", () => {
    expect(BRAND_DEFAULT_COLORS.primary_color).toBe(BRAND.teal);
    expect(BRAND_DEFAULT_COLORS.accent_color).toBe(BRAND.gold);
    expect(BRAND_THEME_COLOR.light).toBe(BRAND.teal);
    expect(BRAND_THEME_COLOR.dark).toBe(BRAND.forestDeep);
  });
});

/* ── WCAG contrast checks for the teal / gold palette ───────────────────── */

interface Pair {
  /** Human-readable surface being checked. */
  name: string;
  fg: string;
  bg: string;
  /** Opaque backdrop behind `bg` when `bg` is translucent. */
  base?: string;
  /** 4.5 = body text (AA), 3 = large text / UI component boundary. */
  min: number;
}

const value = (mode: Mode, token: string) => resolveToken(tokensForMode(SETS, mode), token);

function pairsFor(mode: Mode): Pair[] {
  const t = (token: string) => value(mode, token);
  const appBg = t("--background");
  const sidebarBg = t("--sidebar");

  return [
    // Base surfaces
    { name: "body text on app background", fg: t("--foreground"), bg: appBg, min: 4.5 },
    {
      name: "card text on card",
      fg: t("--card-foreground"),
      bg: t("--card"),
      base: appBg,
      min: 4.5,
    },
    { name: "muted text on app background", fg: t("--muted-foreground"), bg: appBg, min: 4.5 },
    {
      name: "muted text on card",
      fg: t("--muted-foreground"),
      bg: t("--card"),
      base: appBg,
      min: 4.5,
    },
    {
      name: "popover text on popover",
      fg: t("--popover-foreground"),
      bg: t("--popover"),
      base: appBg,
      min: 4.5,
    },

    // Primary / secondary / accent buttons
    { name: "primary button label", fg: t("--primary-foreground"), bg: t("--primary"), min: 4.5 },
    { name: "primary button edge vs app bg", fg: t("--primary"), bg: appBg, min: 3 },
    {
      name: "secondary button label",
      fg: t("--secondary-foreground"),
      bg: t("--secondary"),
      base: appBg,
      min: 4.5,
    },
    { name: "accent button label", fg: t("--accent-foreground"), bg: t("--accent"), min: 4.5 },
    {
      name: "destructive button label",
      fg: t("--destructive-foreground"),
      bg: t("--destructive"),
      min: 4.5,
    },
    {
      name: "link/ghost primary text on card",
      fg: t("--primary"),
      bg: t("--card"),
      base: appBg,
      min: 4.5,
    },
    { name: "focus ring vs app bg", fg: t("--ring"), bg: appBg, min: 3 },
    { name: "input border vs card", fg: t("--input"), bg: t("--card"), base: appBg, min: 3 },

    // Gold "premium" button — gradient spans goldDeep → goldLight
    {
      name: "gold button label on darkest gold stop",
      fg: BRAND.forest,
      bg: BRAND.goldDeep,
      min: 4.5,
    },
    {
      name: "gold button label on lightest gold stop",
      fg: BRAND.forest,
      bg: BRAND.goldLight,
      min: 4.5,
    },

    // Sidebar rail (gradient forest → tealDeep → forestDeep)
    { name: "sidebar label on rail", fg: t("--sidebar-foreground"), bg: sidebarBg, min: 4.5 },
    {
      name: "sidebar label on teal gradient stop",
      fg: t("--sidebar-foreground"),
      bg: BRAND.tealDeep,
      min: 4.5,
    },
    {
      name: "active sidebar item label",
      fg: t("--sidebar-accent-foreground"),
      bg: t("--sidebar-accent"),
      base: sidebarBg,
      min: 4.5,
    },
    {
      name: "active sidebar item on teal stop",
      fg: t("--sidebar-accent-foreground"),
      bg: t("--sidebar-accent"),
      base: BRAND.tealDeep,
      min: 4.5,
    },
    {
      name: "sidebar group label (gold) on rail",
      fg: t("--sidebar-primary"),
      bg: sidebarBg,
      min: 4.5,
    },
    {
      name: "sidebar group label (gold) on teal stop",
      fg: t("--sidebar-primary"),
      bg: BRAND.tealDeep,
      min: 4.5,
    },
    {
      name: "sidebar gold chip label",
      fg: t("--sidebar-primary-foreground"),
      bg: t("--sidebar-primary"),
      min: 4.5,
    },
    { name: "sidebar border vs rail", fg: t("--sidebar-border"), bg: sidebarBg, min: 1.2 },

    // Auth screens — forest hero panel with gold/teal accents + white card
    { name: "auth hero text on forest panel", fg: "#ffffff", bg: BRAND.forest, min: 4.5 },
    {
      name: "auth hero muted text on forest panel",
      fg: t("--sidebar-foreground"),
      bg: BRAND.forest,
      min: 4.5,
    },
    { name: "auth hero gold accent on forest panel", fg: BRAND.gold, bg: BRAND.forest, min: 4.5 },
    {
      name: "auth hero teal accent on forest panel",
      fg: BRAND.tealGlow,
      bg: BRAND.forest,
      min: 4.5,
    },
    {
      name: "auth card label on card",
      fg: t("--foreground"),
      bg: t("--card"),
      base: appBg,
      min: 4.5,
    },
    {
      name: "auth card helper text",
      fg: t("--muted-foreground"),
      bg: t("--card"),
      base: appBg,
      min: 4.5,
    },
    {
      name: "auth submit button label",
      fg: t("--primary-foreground"),
      bg: t("--primary"),
      min: 4.5,
    },

    // Status + chart series need to stay legible on the surface they land on
    { name: "success text on card", fg: t("--success"), bg: t("--card"), base: appBg, min: 4.5 },
    { name: "warning text on card", fg: t("--warning"), bg: t("--card"), base: appBg, min: 4.5 },
    { name: "info text on card", fg: t("--info"), bg: t("--card"), base: appBg, min: 4.5 },
    { name: "chart series 1 vs card", fg: t("--chart-1"), bg: t("--card"), base: appBg, min: 3 },
    { name: "chart series 2 vs card", fg: t("--chart-2"), bg: t("--card"), base: appBg, min: 3 },
    { name: "chart series 3 vs card", fg: t("--chart-3"), bg: t("--card"), base: appBg, min: 3 },
    {
      name: "chart axis labels vs card",
      fg: t("--chart-axis"),
      bg: t("--card"),
      base: appBg,
      min: 3,
    },
  ];
}

for (const mode of MODES) {
  describe(`WCAG contrast — ${mode} mode`, () => {
    const cases = pairsFor(mode).map((p) => [p.name, p] as const);
    it.each(cases)("%s meets its minimum ratio", (_name, pair) => {
      const ratio = contrastRatio(
        pair.fg,
        pair.bg,
        pair.base ?? (mode === "dark" ? "#000000" : "#ffffff"),
      );
      expect(
        round2(ratio),
        `${pair.name} (${mode}): ${pair.fg} on ${pair.bg} = ${round2(ratio)}:1, needs ${pair.min}:1`,
      ).toBeGreaterThanOrEqual(pair.min);
    });
  });
}

describe("branded palette overrides stay AA", () => {
  const contrastOf = (a: string, b: string) => {
    const lum = (hex: string) => {
      const n = parseInt(hex.replace("#", ""), 16);
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
    };
    const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
    return (hi + 0.05) / (lo + 0.05);
  };

  const pick = (css: string, scope: "root" | "dark", name: string) => {
    const block = css.split(scope === "root" ? ":root{" : ".dark{")[1]!.split("}")[0]!;
    return block.match(new RegExp(`${name}: (#[0-9a-f]{6});`))![1]!;
  };

  for (const hex of ["#9fc516", "#f5c451", "#0f766e", "#06231d", "#ffffff"]) {
    it(`derives readable primary tokens for ${hex}`, () => {
      const css = buildBrandPaletteCss({
        primary_color: hex,
        secondary_color: hex,
        accent_color: hex,
      });
      const lightPrimary = pick(css, "root", "--primary");
      const lightFg = pick(css, "root", "--primary-foreground");
      const darkPrimary = pick(css, "dark", "--primary");
      const darkFg = pick(css, "dark", "--primary-foreground");

      // usable as text on the light card surface and on the dark card surface
      expect(contrastOf(lightPrimary, "#ffffff")).toBeGreaterThanOrEqual(4.4);
      expect(contrastOf(darkPrimary, "#0a251f")).toBeGreaterThanOrEqual(4.4);
      // usable as a fill with its paired foreground
      expect(contrastOf(lightPrimary, lightFg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastOf(darkPrimary, darkFg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
