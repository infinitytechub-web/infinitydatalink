import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";

/**
 * Guardian consent & safeguarding attestations for minor (under-18) decisions.
 *
 * These are admin-supplied supporting files, stored in the same
 * `kyc-documents` bucket / `kyc_documents` table as the member's verification
 * uploads so they automatically appear in the Super Admin documents register
 * (view / download / print / export / delete) and are auditable later.
 */

const KYC_BUCKET = "kyc-documents";
const ATTESTATION_ROLES = new Set(["super_admin", "compliance_officer"]);

export const MINOR_ATTESTATION_TYPES = [
  { value: "guardian_consent", label: "Guardian consent" },
  { value: "safeguarding_attestation", label: "Safeguarding attestation" },
] as const;

export type MinorAttestationType = (typeof MINOR_ATTESTATION_TYPES)[number]["value"];

export function minorAttestationLabel(value: string): string {
  return MINOR_ATTESTATION_TYPES.find((t) => t.value === value)?.label ?? value.replace(/_/g, " ");
}

export const MINOR_ATTESTATION_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** 8 MB upload ceiling (base64 payload is decoded server-side). */
export const MINOR_ATTESTATION_MAX_BYTES = 8 * 1024 * 1024;

async function assertAttestationRole(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  const match = roles.find((r: string) => ATTESTATION_ROLES.has(r));
  if (!match) throw new Error("Forbidden: compliance role required");
  return match;
}

function safeName(name: string) {
  return (
    (name.split("/").pop() ?? "file")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file"
  );
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export type MinorAttestation = {
  id: string;
  doc_type: string;
  label: string;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  review_notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  url: string | null;
};

const listSchema = z.object({ member_id: z.string().uuid() });

export const listMinorAttestations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<MinorAttestation[]> => {
    await assertAttestationRole(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const { data: rows, error } = await sb
      .from("kyc_documents")
      .select(
        "id, doc_type, storage_path, mime_type, size_bytes, review_notes, reviewed_by, created_at",
      )
      .eq("member_id", data.member_id)
      .in(
        "doc_type",
        MINOR_ATTESTATION_TYPES.map((t) => t.value),
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const out: MinorAttestation[] = [];
    for (const r of (rows ?? []) as any[]) {
      const { data: signed } = await sb.storage
        .from(KYC_BUCKET)
        .createSignedUrl(r.storage_path, 300);
      out.push({
        id: r.id,
        doc_type: r.doc_type,
        label: minorAttestationLabel(r.doc_type),
        filename: r.storage_path.split("/").pop() ?? r.storage_path,
        storage_path: r.storage_path,
        mime_type: r.mime_type ?? "application/octet-stream",
        size_bytes: r.size_bytes ?? 0,
        review_notes: r.review_notes ?? null,
        uploaded_by: r.reviewed_by ?? null,
        created_at: r.created_at,
        url: signed?.signedUrl ?? null,
      });
    }
    return out;
  });

const uploadSchema = z.object({
  member_id: z.string().uuid(),
  doc_type: z.enum(["guardian_consent", "safeguarding_attestation"]),
  filename: z.string().trim().min(1).max(200),
  mime_type: z.enum(MINOR_ATTESTATION_MIME),
  content_base64: z.string().min(16),
  /** Reference / context recorded alongside the file (e.g. consent reference). */
  note: z.string().trim().min(4).max(600),
});

export const uploadMinorAttestation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => uploadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const role = await assertAttestationRole(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("id, is_minor, full_name, member_no")
      .eq("id", data.member_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Member not found");
    if (!profile.is_minor) {
      throw new Error("Guardian/safeguarding attestations only apply to members under 18.");
    }

    const bytes = decodeBase64(data.content_base64);
    if (bytes.byteLength === 0) throw new Error("Uploaded file is empty.");
    if (bytes.byteLength > MINOR_ATTESTATION_MAX_BYTES) {
      throw new Error("File is larger than the 8 MB limit.");
    }

    const path = `${data.member_id}/minor/${data.doc_type}-${Date.now()}-${safeName(data.filename)}`;
    const { error: upErr } = await sb.storage
      .from(KYC_BUCKET)
      .upload(path, bytes, { contentType: data.mime_type, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: row, error: insErr } = await sb
      .from("kyc_documents")
      .insert({
        member_id: data.member_id,
        doc_type: data.doc_type,
        storage_path: path,
        mime_type: data.mime_type,
        size_bytes: bytes.byteLength,
        // Admin-supplied evidence, not a member submission awaiting review.
        status: "approved",
        review_notes: data.note,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .select("id, created_at")
      .maybeSingle();
    if (insErr) {
      await sb.storage.from(KYC_BUCKET).remove([path]);
      throw new Error(insErr.message);
    }

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: role,
      action: "document.minor_attestation_uploaded",
      target: row?.id ?? data.member_id,
      meta: {
        member_id: data.member_id,
        member_label: [profile.full_name, profile.member_no].filter(Boolean).join(" · ") || null,
        doc_type: data.doc_type,
        storage_path: path,
        mime_type: data.mime_type,
        size_bytes: bytes.byteLength,
        note: data.note,
      },
    });

    return { id: row?.id as string, storage_path: path };
  });

/**
 * Manual trigger for the guardian-consent reminder sweep. The same routine runs
 * nightly on a schedule; compliance can also fire it on demand from the member
 * review screen. Reminders stay idempotent per member per day.
 */
export const sendGuardianConsentReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const role = await assertAttestationRole(context.supabase, context.userId);
    const { runGuardianConsentReminders } = await import("@/lib/guardian-consent-reminders.server");
    const result = await runGuardianConsentReminders();

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: role,
      action: "kyc.minor_consent_reminders_sent",
      target: "guardian_consent_reminders",
      meta: {
        scanned: result.scanned,
        incomplete: result.incomplete,
        staff_notified: result.staff_notified,
        guardians_notified: result.guardians_notified,
      },
    });

    return result;
  });
