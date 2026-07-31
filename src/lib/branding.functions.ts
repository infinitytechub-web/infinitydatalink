import { writeAudit } from "@/lib/audit-log";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "branding";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIMES = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);
const ALLOWED_FAVICON_MIMES = new Set([
  "image/png",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export type BrandingSettings = {
  app_name: string;
  tagline: string | null;
  primary_color: string;
  accent_color: string;
  secondary_color: string;
  logo_url: string | null;
  favicon_url: string | null;
  logo_path: string | null;
  favicon_path: string | null;
  login_hero_url: string | null;
  login_tagline: string | null;
  org_legal_name: string | null;
  org_address: string | null;
  org_registration_no: string | null;
  footer_html: string | null;
  support_email: string | null;
  support_phone: string | null;
  email_from_name: string | null;
  email_reply_to: string | null;
  email_header_html: string | null;
  email_footer_html: string | null;
  updated_at: string;
};

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
  email_from_name: null,
  email_reply_to: null,
  email_header_html: null,
  email_footer_html: null,
  updated_at: new Date(0).toISOString(),
};


async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: super_admin role required");
}

async function signBrandingUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Public read — used by BrandingProvider on every visit. */
export const getBranding = createServerFn({ method: "GET" }).handler(
  async (): Promise<BrandingSettings> => {
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await client
      .from("branding_settings")
      .select(
        // Public projection only. Registered address, registration number and
        // outbound email branding are staff-only (anon lacks column privileges).
        "app_name, tagline, primary_color, accent_color, secondary_color, logo_path, favicon_path, login_hero_url, login_tagline, org_legal_name, footer_html, support_email, support_phone, updated_at",
      )
      .eq("id", 1)
      .maybeSingle();
    if (!data) return DEFAULTS;
    const [logo_url, favicon_url] = await Promise.all([
      signBrandingUrl((data as any).logo_path),
      signBrandingUrl((data as any).favicon_path),
    ]);
    return { ...DEFAULTS, ...(data as any), logo_url, favicon_url } as BrandingSettings;
  },
);

/** Full read including staff-only org/email fields — signed-in super admins only. */
export const getBrandingFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrandingSettings> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data } = await (context.supabase as any)
      .from("branding_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return DEFAULTS;
    const [logo_url, favicon_url] = await Promise.all([
      signBrandingUrl((data as any).logo_path),
      signBrandingUrl((data as any).favicon_path),
    ]);
    return { ...DEFAULTS, ...(data as any), logo_url, favicon_url } as BrandingSettings;
  });

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const updateBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        app_name: z.string().trim().min(1).max(60),
        tagline: z.string().trim().max(160).nullable().optional(),
        primary_color: z.string().regex(HEX, "Invalid hex color"),
        accent_color: z.string().regex(HEX, "Invalid hex color"),
        secondary_color: z.string().regex(HEX, "Invalid hex color").optional(),
        login_hero_url: z.string().url().max(500).nullable().optional().or(z.literal("").transform(() => null)),
        login_tagline: z.string().trim().max(200).nullable().optional(),
        org_legal_name: z.string().trim().max(160).nullable().optional(),
        org_address: z.string().trim().max(500).nullable().optional(),
        org_registration_no: z.string().trim().max(80).nullable().optional(),
        footer_html: z.string().trim().max(2000).nullable().optional(),
        support_email: z.string().trim().email().max(160).nullable().optional().or(z.literal("").transform(() => null)),
        support_phone: z.string().trim().max(40).nullable().optional(),
        email_from_name: z.string().trim().max(80).nullable().optional(),
        email_reply_to: z.string().trim().email().max(160).nullable().optional().or(z.literal("").transform(() => null)),
        email_header_html: z.string().trim().max(4000).nullable().optional(),
        email_footer_html: z.string().trim().max(4000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<BrandingSettings> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const patch: Record<string, any> = {
      app_name: data.app_name,
      tagline: data.tagline ?? null,
      primary_color: data.primary_color,
      accent_color: data.accent_color,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    for (const k of [
      "secondary_color",
      "login_hero_url",
      "login_tagline",
      "org_legal_name",
      "org_address",
      "org_registration_no",
      "footer_html",
      "support_email",
      "support_phone",
      "email_from_name",
      "email_reply_to",
      "email_header_html",
      "email_footer_html",
    ] as const) {
      if ((data as any)[k] !== undefined) patch[k] = (data as any)[k];
    }
    const { error } = await (context.supabase as any)
      .from("branding_settings")
      .update(patch)
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "super_admin",
      action: "branding.updated",
      meta: { fields: Object.keys(patch) },
    });
    return getBranding();
  });

export const uploadBrandingAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["logo", "favicon"]),
        filename: z.string().min(1).max(160),
        mime_type: z.string().min(3).max(80),
        content_base64: z.string().min(4),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<BrandingSettings> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const allowed = data.kind === "logo" ? ALLOWED_LOGO_MIMES : ALLOWED_FAVICON_MIMES;
    if (!allowed.has(data.mime_type)) {
      throw new Error(
        data.kind === "logo"
          ? "Logo must be PNG, JPEG, SVG, or WEBP"
          : "Favicon must be PNG, SVG, or ICO",
      );
    }
    const b64 = data.content_base64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(b64, "base64");
    if (buffer.byteLength > MAX_BYTES) throw new Error("File exceeds 2 MB limit.");

    const safe = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
    const path = `${data.kind}/${crypto.randomUUID()}-${safe}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await (supabaseAdmin as any).storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: data.mime_type, upsert: false });
    if (upErr) throw new Error(upErr.message);

    // Fetch current path to clean up old asset
    const { data: prev } = await context.supabase
      .from("branding_settings")
      .select("logo_path, favicon_path")
      .eq("id", 1)
      .maybeSingle();
    const oldPath = data.kind === "logo" ? (prev as any)?.logo_path : (prev as any)?.favicon_path;

    const patch =
      data.kind === "logo"
        ? { logo_path: path, updated_at: new Date().toISOString(), updated_by: context.userId }
        : { favicon_path: path, updated_at: new Date().toISOString(), updated_by: context.userId };
    const { error } = await context.supabase.from("branding_settings").update(patch).eq("id", 1);
    if (error) throw new Error(error.message);

    if (oldPath) {
      await (supabaseAdmin as any).storage.from(BUCKET).remove([oldPath]).catch(() => {});
    }
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "super_admin",
      action: `branding.${data.kind}.uploaded`,
      meta: { path, size_bytes: buffer.byteLength },
    });
    return getBranding();
  });

export const clearBrandingAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["logo", "favicon"]) }).parse(d))
  .handler(async ({ data, context }): Promise<BrandingSettings> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: prev } = await context.supabase
      .from("branding_settings")
      .select("logo_path, favicon_path")
      .eq("id", 1)
      .maybeSingle();
    const oldPath = data.kind === "logo" ? (prev as any)?.logo_path : (prev as any)?.favicon_path;
    const patch =
      data.kind === "logo"
        ? { logo_path: null, updated_at: new Date().toISOString(), updated_by: context.userId }
        : { favicon_path: null, updated_at: new Date().toISOString(), updated_by: context.userId };
    const { error } = await context.supabase.from("branding_settings").update(patch).eq("id", 1);
    if (error) throw new Error(error.message);
    if (oldPath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any).storage.from(BUCKET).remove([oldPath]).catch(() => {});
    }
    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "super_admin",
      action: `branding.${data.kind}.cleared`,
    });
    return getBranding();
  });
