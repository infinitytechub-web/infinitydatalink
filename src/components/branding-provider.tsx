import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBranding, type BrandingSettings } from "@/lib/branding.functions";

const DEFAULTS: BrandingSettings = {
  app_name: "IT-360 CashApp",
  tagline: null,
  primary_color: "#0d9488",
  accent_color: "#f5c451",
  secondary_color: "#0f766e",
  logo_url: null,
  favicon_url: null,
  logo_path: null,
  favicon_path: null,
  login_hero_url: null,
  login_tagline: null,
  org_legal_name: null,
  org_address: null,
  org_registration_no: null,
  footer_html: null,
  support_email: null,
  support_phone: null,
  updated_at: new Date(0).toISOString(),
};

type BrandingContextValue = {
  branding: BrandingSettings;
  isLoading: boolean;
  refresh: () => void;
};

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULTS,
  isLoading: false,
  refresh: () => {},
});

export const BRANDING_QUERY_KEY = ["branding"] as const;

function hexToRgb(hex: string): string | null {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (full.length !== 6) return null;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function applyBranding(branding: BrandingSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const primary = hexToRgb(branding.primary_color);
  const accent = hexToRgb(branding.accent_color);
  const secondary = hexToRgb(branding.secondary_color);
  if (primary) root.style.setProperty("--brand-primary-rgb", primary);
  if (accent) root.style.setProperty("--brand-accent-rgb", accent);
  if (secondary) root.style.setProperty("--brand-secondary-rgb", secondary);
  root.style.setProperty("--brand-primary", branding.primary_color);
  root.style.setProperty("--brand-accent", branding.accent_color);
  root.style.setProperty("--brand-secondary", branding.secondary_color);

  // Update <title> suffix
  if (branding.app_name) {
    const current = document.title;
    if (!current.includes(branding.app_name)) {
      const parts = current.split(" — ");
      const head = parts.length > 1 ? parts[0] : current;
      document.title = `${head} — ${branding.app_name}`;
    }
  }

  // Update favicon <link>
  if (branding.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = branding.favicon_url;
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const fetchBranding = useServerFn(getBranding);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: () => fetchBranding(),
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULTS,
  });

  const branding = query.data ?? DEFAULTS;

  useEffect(() => {
    applyBranding(branding);
  }, [branding]);

  const value = useMemo<BrandingContextValue>(
    () => ({
      branding,
      isLoading: query.isLoading,
      refresh: () => qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY }),
    }),
    [branding, query.isLoading, qc],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
