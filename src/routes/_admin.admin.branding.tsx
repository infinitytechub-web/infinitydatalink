import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useBranding, BRANDING_QUERY_KEY } from "@/components/branding-provider";
import {
  updateBranding,
  uploadBrandingAsset,
  clearBrandingAsset,
} from "@/lib/branding.functions";

export const Route = createFileRoute("/_admin/admin/branding")({
  head: () => ({
    meta: [
      { title: "Branding — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
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

function BrandingEditor() {
  const { branding, refresh } = useBranding();
  const qc = useQueryClient();
  const [appName, setAppName] = useState(branding.app_name);
  const [tagline, setTagline] = useState(branding.tagline ?? "");
  const [primary, setPrimary] = useState(branding.primary_color);
  const [accent, setAccent] = useState(branding.accent_color);

  useEffect(() => {
    setAppName(branding.app_name);
    setTagline(branding.tagline ?? "");
    setPrimary(branding.primary_color);
    setAccent(branding.accent_color);
  }, [branding.app_name, branding.tagline, branding.primary_color, branding.accent_color]);

  const updateFn = useServerFn(updateBranding);
  const uploadFn = useServerFn(uploadBrandingAsset);
  const clearFn = useServerFn(clearBrandingAsset);

  const invalidate = () => qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          app_name: appName.trim(),
          tagline: tagline.trim() ? tagline.trim() : null,
          primary_color: primary,
          accent_color: accent,
        },
      }),
    onSuccess: () => {
      toast.success("Branding updated");
      invalidate();
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const uploadMut = useMutation({
    mutationFn: async ({ kind, file }: { kind: "logo" | "favicon"; file: File }) => {
      const base64 = await fileToBase64(file);
      return uploadFn({
        data: {
          kind,
          filename: file.name,
          mime_type: file.type,
          content_base64: base64,
        },
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
    mutationFn: (kind: "logo" | "favicon") => clearFn({ data: { kind } }),
    onSuccess: () => {
      toast.success("Cleared");
      invalidate();
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const canSave =
    appName.trim().length > 0 && HEX.test(primary) && HEX.test(accent) && !saveMut.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Branding"
       
      />

      <SectionCard title="Identity">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="app-name">App name</Label>
            <Input
              id="app-name"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tagline">Tagline (optional)</Label>
            <Textarea
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={160}
              rows={2}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Colors">
        <div className="grid gap-4 md:grid-cols-2">
          <ColorField label="Primary" value={primary} onChange={setPrimary} />
          <ColorField label="Accent" value={accent} onChange={setAccent} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <div
            className="flex h-16 flex-1 min-w-[180px] items-center justify-center rounded-lg text-sm font-medium text-white shadow"
            style={{ backgroundColor: HEX.test(primary) ? primary : "#0d9488" }}
          >
            Primary
          </div>
          <div
            className="flex h-16 flex-1 min-w-[180px] items-center justify-center rounded-lg text-sm font-medium text-black shadow"
            style={{ backgroundColor: HEX.test(accent) ? accent : "#f5c451" }}
          >
            Accent
          </div>
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

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setAppName(branding.app_name);
            setTagline(branding.tagline ?? "");
            setPrimary(branding.primary_color);
            setAccent(branding.accent_color);
          }}
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
          placeholder="#0d9488"
          className={valid ? "" : "border-destructive"}
        />
      </div>
      {!valid ? (
        <p className="text-xs text-destructive">Enter a valid hex color like #0d9488</p>
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
  kind: "logo" | "favicon";
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
          <img src={currentUrl} alt={`Current ${kind}`} className="max-h-full max-w-full object-contain" />
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
