import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { resubmitMyKyc, saveKycRemediationFields } from "@/lib/member-kyc.functions";
import {
  createKycUploadUrl,
  registerKycDocument,
  type KycDocType,
} from "@/lib/member-profile.functions";

export type RemediationEntry = {
  key: string;
  kind: "profile" | "document";
  field: string | null;
  doc_type: string | null;
  label: string;
  resolved: boolean;
  current_value: string | null;
};

/**
 * Lets a member fix exactly the items a reviewer flagged, then resubmit.
 * Nothing outside the flagged list is editable here.
 */
export function KycResubmissionPanel({
  items,
  canResubmit,
  reviewerNotes,
}: {
  items: RemediationEntry[];
  canResubmit: boolean;
  reviewerNotes: string | null;
}) {
  const qc = useQueryClient();
  const saveFields = useServerFn(saveKycRemediationFields);
  const resubmit = useServerFn(resubmitMyKyc);

  const profileItems = items.filter((i) => i.kind === "profile");
  const docItems = items.filter((i) => i.kind === "document");

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(profileItems.map((i) => [i.field as string, i.current_value ?? ""])),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["member", "kyc"] });
    qc.invalidateQueries({ queryKey: ["member", "profile"] });
  };

  const onSave = async () => {
    const payload: Record<string, string> = {};
    for (const item of profileItems) {
      const field = item.field as string;
      const v = (values[field] ?? "").trim();
      if (v.length === 0) {
        toast.error(`${item.label} is required.`);
        return;
      }
      payload[field] = v;
    }
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    try {
      await saveFields({ data: { values: payload } });
      toast.success("Revisions saved");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save revisions");
    } finally {
      setSaving(false);
    }
  };

  const onResubmit = async () => {
    setSending(true);
    try {
      await resubmit({ data: { note } });
      toast.success("Verification resubmitted for review");
      setNote("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not resubmit");
    } finally {
      setSending(false);
    }
  };

  const outstanding = items.filter((i) => !i.resolved).length;

  return (
    <SectionCard title="Requested revisions">
      <div className="space-y-6 p-6">
        <p className="text-sm text-emerald-deep/80">
          Your verification was returned. Update only the {items.length} item
          {items.length === 1 ? "" : "s"} below, then resubmit — everything else stays as reviewed.
        </p>
        {reviewerNotes ? (
          <div className="rounded border border-emerald-deep/10 bg-cream/40 px-3 py-2 text-sm text-emerald-deep/80">
            <span className="font-semibold">Reviewer note:</span> {reviewerNotes}
          </div>
        ) : null}

        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              {item.resolved ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <CircleDashed className="h-4 w-4 shrink-0 text-emerald-deep/40" />
              )}
              <span className={item.resolved ? "text-emerald-deep/60 line-through" : ""}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>

        {profileItems.length > 0 ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {profileItems.map((item) => {
                const field = item.field as string;
                return (
                  <div key={item.key} className="space-y-1.5">
                    <Label htmlFor={`rem-${field}`}>{item.label}</Label>
                    <Input
                      id={`rem-${field}`}
                      type={field === "date_of_birth" ? "date" : "text"}
                      value={values[field] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field]: e.target.value }))
                      }
                    />
                  </div>
                );
              })}
            </div>
            <Button type="button" variant="secondary" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save revisions
            </Button>
          </div>
        ) : null}

        {docItems.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {docItems.map((item) => (
              <DocReupload
                key={item.key}
                type={item.doc_type as KycDocType}
                label={item.label}
                resolved={item.resolved}
                onDone={refresh}
              />
            ))}
          </div>
        ) : null}

        <div className="space-y-2 border-t border-emerald-deep/10 pt-4">
          <Label htmlFor="resubmit-note">Message to the reviewer (optional)</Label>
          <Textarea
            id="resubmit-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Explain what you changed…"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onResubmit} disabled={!canResubmit || sending}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Resubmit for review
            </Button>
            {!canResubmit ? (
              <span className="text-[11px] text-emerald-deep/60">
                {outstanding} item{outstanding === 1 ? "" : "s"} still outstanding.
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function DocReupload({
  type,
  label,
  resolved,
  onDone,
}: {
  type: KycDocType;
  label: string;
  resolved: boolean;
  onDone: () => void;
}) {
  const create = useServerFn(createKycUploadUrl);
  const register = useServerFn(registerKycDocument);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const signed = await create({
        data: { doc_type: type, filename: file.name, mime_type: file.type, size_bytes: file.size },
      });
      const { error: upErr } = await supabase.storage
        .from("kyc-documents")
        .uploadToSignedUrl(signed.storage_path, signed.token, file, { contentType: file.type });
      if (upErr) throw upErr;
      await register({
        data: {
          doc_type: type,
          storage_path: signed.storage_path,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      toast.success(`Re-uploaded ${label}`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded border border-emerald-deep/10 bg-cream/30 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {resolved ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <CircleDashed className="h-4 w-4 text-emerald-deep/40" />
        )}
        {label}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {resolved ? "Replace file" : "Upload new file"}
      </Button>
    </div>
  );
}
