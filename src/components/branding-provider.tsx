import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { applyBrandPalette } from "@/lib/brand-theme";
import { BRAND_DEFAULT_COLORS } from "@/lib/brand-palette";
import { supabase } from "@/integrations/supabase/client";
import {
  getBranding,
  getBrandingContacts,
  getBrandingVersion,
  type BrandingSettings,
} from "@/lib/branding.functions";

const DEFAULTS: BrandingSettings = {
  app_name: "IT-360 CashApp",
  tagline: null,
  primary_color: BRAND_DEFAULT_COLORS.primary_color,
  accent_color: BRAND_DEFAULT_COLORS.accent_color,
  secondary_color: BRAND_DEFAULT_COLORS.secondary_color,
  logo_url: null,
  favicon_url: null,
  touch_icon_url: null,
  logo_path: null,
  favicon_path: null,
  touch_icon_path: null,
  logo_version: 1,
  favicon_version: 1,
  touch_icon_version: 1,
  login_hero_url: null,
  login_tagline: null,
  org_legal_name: null,
  org_address: null,
  org_registration_no: null,
  footer_html: null,
  support_email: null,
  support_phone: null,
  email_from_name: null,
  email_reply_to: null,
  email_header_html: null,
  email_footer_html: null,
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
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (full.length !== 6) return null;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function setIconLink(selector: string, rel: string, href: string | null) {
  const existing = document.querySelector<HTMLLinkElement>(selector);
  if (!href) {
    // Only remove links this provider owns, leaving static template icons alone.
    if (existing?.dataset["brandIcon"] === "1") existing.remove();
    return;
  }
  const link = existing ?? document.createElement("link");
  link.rel = rel;
  link.dataset["brandIcon"] = "1";
  if (link.href !== href) link.href = href;
  if (!existing) document.head.appendChild(link);
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

  // Drive the actual design tokens (buttons, focus rings, sidebar accents)
  // from the admin-selected brand colors, for light and dark mode alike.
  applyBrandPalette({
    primary_color: branding.primary_color,
    secondary_color: branding.secondary_color,
    accent_color: branding.accent_color,
  });

  // Update <title> suffix
  if (branding.app_name) {
    const current = document.title;
    if (!current.includes(branding.app_name)) {
      const parts = current.split(" — ");
      const head = parts.length > 1 ? parts[0] : current;
      document.title = `${head} — ${branding.app_name}`;
    }
  }

  // Update favicon + home-screen touch icon <link> tags. Both URLs already
  // carry ?v=<version>, so assigning them replaces any cached icon instantly.
  setIconLink('link[rel="icon"]', "icon", branding.favicon_url);
  setIconLink('link[rel="shortcut icon"]', "shortcut icon", branding.favicon_url);
  setIconLink(
    'link[rel="apple-touch-icon"]',
    "apple-touch-icon",
    branding.touch_icon_url ?? branding.favicon_url,
  );
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

  // Support contacts and the legal footer are not readable anonymously, so they
  // are fetched separately once a session exists.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const fetchContacts = useServerFn(getBrandingContacts);
  const contactsQuery = useQuery({
    queryKey: ["branding", "contacts"],
    queryFn: () => fetchContacts(),
    enabled: signedIn,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const base = query.data ?? DEFAULTS;
  const branding = useMemo<BrandingSettings>(
    () => (contactsQuery.data ? { ...base, ...contactsQuery.data } : base),
    [base, contactsQuery.data],
  );

  // Lightweight version poll: whenever an admin uploads or clears a logo /
  // favicon, the version counter bumps and every open device refetches full
  // branding, picking up the new cache-busted asset URL right away.
  const fetchVersion = useServerFn(getBrandingVersion);
  const versionQuery = useQuery({
    queryKey: ["branding", "version"],
    queryFn: () => fetchVersion(),
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const remoteLogoVersion = versionQuery.data?.logo_version;
  const remoteFaviconVersion = versionQuery.data?.favicon_version;
  const remoteTouchIconVersion = versionQuery.data?.touch_icon_version;

  useEffect(() => {
    if (
      remoteLogoVersion === undefined ||
      remoteFaviconVersion === undefined ||
      remoteTouchIconVersion === undefined
    )
      return;
    if (
      remoteLogoVersion !== branding.logo_version ||
      remoteFaviconVersion !== branding.favicon_version ||
      remoteTouchIconVersion !== branding.touch_icon_version
    ) {
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
    }
  }, [
    remoteLogoVersion,
    remoteFaviconVersion,
    remoteTouchIconVersion,
    branding.logo_version,
    branding.favicon_version,
    branding.touch_icon_version,
    qc,
  ]);

  useEffect(() => {
    applyBranding(branding);
  }, [branding]);

  const value = useMemo<BrandingContextValue>(
    () => ({
      branding,
      isLoading: query.isLoading,
      refresh: () => {
        qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
        qc.invalidateQueries({ queryKey: ["branding", "version"] });
        qc.invalidateQueries({ queryKey: ["branding", "contacts"] });
      },
    }),
    [branding, query.isLoading, qc],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
