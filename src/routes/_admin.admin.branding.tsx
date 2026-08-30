import { BRAND, BRAND_DEFAULT_COLORS } from "@/lib/brand-palette";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useBranding, BRANDING_QUERY_KEY } from "@/components/branding-provider";
import { applyBrandPalette } from "@/lib/brand-theme";
import {
  getBrandingFull,
  updateBranding,
  uploadBrandingAsset,
  clearBrandingAsset,
} from "@/lib/branding.functions";

export const Route = createFileRoute("/_admin/admin/branding")({
  head: () => ({
    meta: [{ title: "Branding — IT-360 CashApp" }, { name: "robots", content: "noindex" }],
  }),
  component: BrandingPage,
});

function BrandingPage() {
  const { hasRole, loading } = useAuth();
  if (loading) return null;
  if (!hasRole("super_admin")) return <Navigate to="/admin" replace />;
  return <BrandingEditor />;
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type Form = {
  app_name: string;
  tagline: string;
  primary_color: string;
  accent_color: string;
  secondary_color: string;
  login_hero_url: string;
  login_tagline: string;
  org_legal_name: string;
  org_address: string;
  org_registration_no: string;
  footer_html: string;
  support_email: string;
  support_phone: string;
  email_from_name: string;
  email_reply_to: string;
  email_header_html: string;
  email_footer_html: string;
};

type BrandingLike = ReturnType<typeof useBranding>["branding"];

function toForm(b: BrandingLike): Form {
  return {
    app_name: b.app_name,
    tagline: b.tagline ?? "",
    primary_color: b.primary_color,
    accent_color: b.accent_color,
    secondary_color: b.secondary_color,
    login_hero_url: b.login_hero_url ?? "",
    login_tagline: b.login_tagline ?? "",
    org_legal_name: b.org_legal_name ?? "",
    org_address: b.org_address ?? "",
    org_registration_no: b.org_registration_no ?? "",
    footer_html: b.footer_html ?? "",
    support_email: b.support_email ?? "",
    support_phone: b.support_phone ?? "",
    email_from_name: b.email_from_name ?? "",
    email_reply_to: b.email_reply_to ?? "",
    email_header_html: b.email_header_html ?? "",
    email_footer_html: b.email_footer_html ?? "",
  };
}

function BrandingEditor() {
  const { branding, refresh } = useBranding();
  const qc = useQueryClient();
  // The public branding read omits staff-only org/email fields, so the editor
  // loads the full row through an authenticated super-admin-only server fn.
  const fetchFull = useServerFn(getBrandingFull);
  const fullQuery = useQuery({
    queryKey: [...BRANDING_QUERY_KEY, "full"],
    queryFn: () => fetchFull(),
    staleTime: 30_000,
  });
  const source: BrandingLike = (fullQuery.data as BrandingLike | undefined) ?? branding;
  const [form, setForm] = useState<Form>(() => toForm(source));

  useEffect(() => {
    setForm(toForm(source));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.updated_at, fullQuery.data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const updateFn = useServerFn(updateBranding);
  const uploadFn = useServerFn(uploadBrandingAsset);
  const clearFn = useServerFn(clearBrandingAsset);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
    fullQuery.refetch();
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const trim = (s: string) => (s.trim() ? s.trim() : null);
      return updateFn({
        data: {
          app_name: form.app_name.trim(),
          tagline: trim(form.tagline),
          primary_color: form.primary_color,
          accent_color: form.accent_color,
          secondary_color: form.secondary_color,
          login_hero_url: trim(form.login_hero_url),
          login_tagline: trim(form.login_tagline),
          org_legal_name: trim(form.org_legal_name),
          org_address: trim(form.org_address),
          org_registration_no: trim(form.org_registration_no),
          footer_html: trim(form.footer_html),
          support_email: trim(form.support_email),
          support_phone: trim(form.support_phone),
          email_from_name: trim(form.email_from_name),
          email_reply_to: trim(form.email_reply_to),
          email_header_html: trim(form.email_header_html),
          email_footer_html: trim(form.email_footer_html),
        },
      });
    },
    onSuccess: () => {
      toast.success("Branding updated");
      invalidate();
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const uploadMut = useMutation({
    mutationFn: async ({ kind, file }: { kind: "logo" | "favicon" | "touch_icon"; file: File }) => {
      const base64 = await fileToBase64(file);
      return uploadFn({
        data: { kind, filename: file.name, mime_type: file.type, content_base64: base64 },
      });
    },
    onSuccess: () => {
      toast.success("Uploaded");
      invalidate();
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Upload failed"),
  });

  const clearMut = useMutation({
    mutationFn: (kind: "logo" | "favicon" | "touch_icon") => clearFn({ data: { kind } }),
    onSuccess: () => {
      toast.success("Cleared");
      invalidate();
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const colorsValid =
    HEX.test(form.primary_color) && HEX.test(form.accent_color) && HEX.test(form.secondary_color);
  const canSave = form.app_name.trim().length > 0 && colorsValid && !saveMut.isPending;

  // Live preview: while the colors in the form are valid, drive the real theme
  // tokens so the admin sees buttons, rings and accents update as they pick.
  // On leaving the page the saved branding is re-applied.
  useEffect(() => {
    if (!colorsValid) return;
    applyBrandPalette({
      primary_color: form.primary_color,
      secondary_color: form.secondary_color,
      accent_color: form.accent_color,
    });
  }, [colorsValid, form.primary_color, form.secondary_color, form.accent_color]);

  useEffect(
    () => () => {
      applyBrandPalette({
        primary_color: branding.primary_color,
        secondary_color: branding.secondary_color,
        accent_color: branding.accent_color,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Branding"
        description="Customize identity, colors, organization details, login and footer copy, support contacts, and outbound email branding. Changes apply immediately across the platform."
      />

      <BrandingPreview form={form} logoUrl={branding.logo_url} />

      <SectionCard title="Identity">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldText
            id="app-name"
            label="App name"
            value={form.app_name}
            onChange={(v) => set("app_name", v)}
            maxLength={60}
          />
          <FieldArea
            id="tagline"
            label="Tagline (optional)"
            value={form.tagline}
            onChange={(v) => set("tagline", v)}
            maxLength={160}
            rows={2}
          />
        </div>
      </SectionCard>

      <SectionCard title="Colors">
        <div className="grid gap-4 md:grid-cols-3">
          <ColorField
            label="Primary"
            value={form.primary_color}
            onChange={(v) => set("primary_color", v)}
          />
          <ColorField
            label="Secondary"
            value={form.secondary_color}
            onChange={(v) => set("secondary_color", v)}
          />
          <ColorField
            label="Accent"
            value={form.accent_color}
            onChange={(v) => set("accent_color", v)}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Swatch color={form.primary_color} label="Primary" light />
          <Swatch color={form.secondary_color} label="Secondary" light />
          <Swatch color={form.accent_color} label="Accent" />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Live component preview
          </span>
          <Button size="sm">Primary action</Button>
          <Button size="sm" variant="secondary">
            Secondary
          </Button>
          <Button size="sm" variant="outline">
            Outline
          </Button>
          <Input className="h-9 w-40" placeholder="Focus me" aria-label="Focus ring preview" />
        </div>
      </SectionCard>

      <SectionCard title="Logo">
        <AssetUploader
          kind="logo"
          currentUrl={branding.logo_url}
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onUpload={(file) => uploadMut.mutate({ kind: "logo", file })}
          onClear={() => clearMut.mutate("logo")}
          busy={uploadMut.isPending || clearMut.isPending}
        />
      </SectionCard>

      <SectionCard title="Favicon">
        <AssetUploader
          kind="favicon"
          currentUrl={branding.favicon_url}
          accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
          onUpload={(file) => uploadMut.mutate({ kind: "favicon", file })}
          onClear={() => clearMut.mutate("favicon")}
          busy={uploadMut.isPending || clearMut.isPending}
        />
      </SectionCard>

      <SectionCard title="Home screen touch icon">
        <p className="mb-3 text-xs text-muted-foreground">
          Square PNG, JPEG, or WEBP (180x180 or larger). Used as the app icon when members add the
          app to a phone home screen. Falls back to the favicon.
        </p>
        <AssetUploader
          kind="touch_icon"
          currentUrl={branding.touch_icon_url}
          accept="image/png,image/jpeg,image/webp"
          onUpload={(file) => uploadMut.mutate({ kind: "touch_icon", file })}
          onClear={() => clearMut.mutate("touch_icon")}
          busy={uploadMut.isPending || clearMut.isPending}
        />
      </SectionCard>

      <SectionCard title="Organization details">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldText
            id="org-name"
            label="Legal name"
            value={form.org_legal_name}
            onChange={(v) => set("org_legal_name", v)}
            maxLength={160}
          />
          <FieldText
            id="org-reg"
            label="Registration / Tax ID"
            value={form.org_registration_no}
            onChange={(v) => set("org_registration_no", v)}
            maxLength={80}
          />
          <div className="md:col-span-2">
            <FieldArea
              id="org-addr"
              label="Registered address"
              value={form.org_address}
              onChange={(v) => set("org_address", v)}
              maxLength={500}
              rows={3}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Login page">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldText
            id="login-hero"
            label="Hero image URL"
            value={form.login_hero_url}
            onChange={(v) => set("login_hero_url", v)}
            maxLength={500}
            placeholder="https://…/hero.jpg"
          />
          <FieldArea
            id="login-tagline"
            label="Login tagline"
            value={form.login_tagline}
            onChange={(v) => set("login_tagline", v)}
            maxLength={200}
            rows={2}
            placeholder="Shown under the sign-in title"
          />
        </div>
      </SectionCard>

      <SectionCard title="Footer & support">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldText
            id="support-email"
            label="Support email"
            value={form.support_email}
            onChange={(v) => set("support_email", v)}
            maxLength={160}
            placeholder="support@example.com"
          />
          <FieldText
            id="support-phone"
            label="Support phone"
            value={form.support_phone}
            onChange={(v) => set("support_phone", v)}
            maxLength={40}
            placeholder="+233…"
          />
          <div className="md:col-span-2">
            <FieldArea
              id="footer-html"
              label="Footer HTML"
              value={form.footer_html}
              onChange={(v) => set("footer_html", v)}
              maxLength={2000}
              rows={4}
              placeholder="Optional. Rendered at the bottom of public pages."
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Email branding">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldText
            id="email-from"
            label="From name"
            value={form.email_from_name}
            onChange={(v) => set("email_from_name", v)}
            maxLength={80}
            placeholder="IT-360 CashApp"
          />
          <FieldText
            id="email-reply"
            label="Reply-to address"
            value={form.email_reply_to}
            onChange={(v) => set("email_reply_to", v)}
            maxLength={160}
            placeholder="no-reply@example.com"
          />
          <div className="md:col-span-2">
            <FieldArea
              id="email-header"
              label="Email header HTML"
              value={form.email_header_html}
              onChange={(v) => set("email_header_html", v)}
              maxLength={4000}
              rows={3}
            />
          </div>
          <div className="md:col-span-2">
            <FieldArea
              id="email-footer"
              label="Email footer HTML"
              value={form.email_footer_html}
              onChange={(v) => set("email_footer_html", v)}
              maxLength={4000}
              rows={3}
            />
          </div>
        </div>
      </SectionCard>

      <div className="sticky bottom-4 z-10 flex justify-end gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button
          variant="outline"
          onClick={() => setForm(toForm(source))}
          disabled={saveMut.isPending}
        >
          Reset
        </Button>
        <Button onClick={() => saveMut.mutate()} disabled={!canSave}>
          {saveMut.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function Swatch({ color, label, light }: { color: string; label: string; light?: boolean }) {
  const valid = HEX.test(color);
  return (
    <div
      className="flex h-16 flex-1 min-w-[160px] items-center justify-center rounded-lg text-sm font-medium shadow"
      style={{ backgroundColor: valid ? color : "#888", color: light ? "#fff" : "#000" }}
    >
      {label}
    </div>
  );
}

function FieldText({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </div>
  );
}

function FieldArea({
  id,
  label,
  value,
  onChange,
  maxLength,
  rows,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = HEX.test(value);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded border border-border bg-transparent"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={BRAND.teal}
          className={valid ? "" : "border-destructive"}
        />
      </div>
      {!valid ? (
        <p className="text-xs text-destructive">Enter a valid hex color like {BRAND.teal}</p>
      ) : null}
    </div>
  );
}

function AssetUploader({
  kind,
  currentUrl,
  accept,
  onUpload,
  onClear,
  busy,
}: {
  kind: "logo" | "favicon" | "touch_icon";
  currentUrl: string | null;
  accept: string;
  onUpload: (file: File) => void;
  onClear: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-md border border-border bg-muted/40 p-2">
        {currentUrl ? (
          <img
            src={currentUrl}
            alt={`Current ${kind}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <input
          ref={ref}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => ref.current?.click()} disabled={busy}>
            {currentUrl ? "Replace" : "Upload"}
          </Button>
          {currentUrl ? (
            <Button variant="ghost" onClick={onClear} disabled={busy}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function BrandingPreview({ form, logoUrl }: { form: Form; logoUrl: string | null }) {
  const primary = HEX.test(form.primary_color)
    ? form.primary_color
    : BRAND_DEFAULT_COLORS.primary_color;
  const accent = HEX.test(form.accent_color)
    ? form.accent_color
    : BRAND_DEFAULT_COLORS.accent_color;
  const secondary = HEX.test(form.secondary_color)
    ? form.secondary_color
    : BRAND_DEFAULT_COLORS.secondary_color;
  return (
    <SectionCard title="Live preview">
      <div className="p-6">
        <p className="mb-3 text-xs text-muted-foreground">
          A mock preview of the sign-in banner, navigation, and CTA using unsaved values. Save to
          apply across the platform.
        </p>
        <div
          className="overflow-hidden rounded-xl border border-border shadow-sm"
          style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
        >
          <div className="flex items-center justify-between px-6 py-4 text-white">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-8 w-auto rounded bg-white/10 p-1" />
              ) : (
                <div className="grid size-8 place-items-center rounded bg-white/15 text-xs font-bold">
                  {(form.app_name || "IT").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-sm font-bold">{form.app_name || "IT-360 CashApp"}</div>
                {form.tagline ? <div className="text-[11px] opacity-80">{form.tagline}</div> : null}
              </div>
            </div>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm"
              style={{ background: accent, color: "#1a1a1a" }}
            >
              Sign in
            </button>
          </div>
          <div className="bg-white/10 px-6 py-8 text-white">
            <div className="text-lg font-semibold">
              {form.login_tagline || "Welcome back to your dashboard."}
            </div>
            <div className="mt-1 text-xs opacity-80">
              {form.org_legal_name || "Your organization"} • Support:{" "}
              {form.support_email || "support@example.com"}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
