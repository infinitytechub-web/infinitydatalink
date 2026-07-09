import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type KycDocType =
  | "national_id_front"
  | "national_id_back"
  | "selfie"
  | "proof_of_address"
  | "other";

export type KycDocStatus = "pending" | "approved" | "rejected";

export type KycDocument = {
  id: string;
  member_id: string;
  doc_type: KycDocType;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: KycDocStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type NextOfKin = {
  id: string;
  full_name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
};

export type MemberProfileFull = {
  profile: {
    id: string;
    full_name: string | null;
    member_no: string | null;
    email: string | null;
    phone: string | null;
    national_id: string | null;
    region: string | null;
    date_of_birth: string | null;
    gender: string | null;
    digital_address: string | null;
    address_line: string | null;
    occupation: string | null;
    employer: string | null;
    kyc: KycDocStatus;
    kyc_notes: string | null;
    kyc_reviewed_at: string | null;
    tier: string;
  };
  next_of_kin: NextOfKin[];
  documents: KycDocument[];
};

const BUCKET = "kyc-documents";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "application/pdf"]);

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberProfileFull> => {
    const sb = context.supabase;
    const uid = context.userId;

    const [{ data: profile, error: pErr }, { data: nok }, { data: docs }] = await Promise.all([
      sb
        .from("profiles")
        .select(
          "id, full_name, member_no, phone, national_id, region, date_of_birth, gender, digital_address, address_line, occupation, employer, kyc, kyc_notes, kyc_reviewed_at, tier",
        )
        .eq("id", uid)
        .maybeSingle(),
      sb
        .from("next_of_kin")
        .select("id, full_name, relationship, phone, email, national_id, address, created_at, updated_at")
        .eq("member_id", uid)
        .order("created_at", { ascending: true }),
      sb
        .from("kyc_documents")
        .select("id, member_id, doc_type, storage_path, mime_type, size_bytes, status, review_notes, reviewed_at, created_at")
        .eq("member_id", uid)
        .order("created_at", { ascending: false }),
    ]);

    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Profile not found");

    return {
      profile: {
        ...(profile as any),
        email: (context.claims as any)?.email ?? null,
      },
      next_of_kin: (nok ?? []) as NextOfKin[],
      documents: (docs ?? []) as KycDocument[],
    };
  });

const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  national_id: z.string().trim().max(80).nullable().optional(),
  region: z.string().trim().max(80).nullable().optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().optional(),
  gender: z.string().trim().max(40).nullable().optional(),
  digital_address: z.string().trim().max(80).nullable().optional(),
  address_line: z.string().trim().max(240).nullable().optional(),
  occupation: z.string().trim().max(120).nullable().optional(),
  employer: z.string().trim().max(160).nullable().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => profileUpdateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // If the profile is already verified, block edits to identity-locked fields.
    const { data: current } = await sb
      .from("profiles")
      .select("kyc")
      .eq("id", context.userId)
      .maybeSingle();
    const isVerified = current?.kyc === "active";

    const patch: Record<string, unknown> = { ...data };
    if (isVerified) {
      if ("national_id" in patch) delete patch.national_id;
      if ("date_of_birth" in patch) delete patch.date_of_birth;
    }
    if (Object.keys(patch).length === 0) return { updated: false };

    const { error } = await sb.from("profiles").update(patch).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { updated: true, locked_identity: isVerified };
  });

const nokSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(2).max(60),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(160).nullable().optional().or(z.literal("").transform(() => null)),
  national_id: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
});

export const upsertNextOfKin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => nokSchema.parse(data))
  .handler(async ({ data, context }): Promise<NextOfKin> => {
    const sb = context.supabase;
    const payload = {
      member_id: context.userId,
      full_name: data.full_name,
      relationship: data.relationship,
      phone: data.phone ?? null,
      email: data.email ?? null,
      national_id: data.national_id ?? null,
      address: data.address ?? null,
    };
    if (data.id) {
      const { data: row, error } = await sb
        .from("next_of_kin")
        .update(payload)
        .eq("id", data.id)
        .eq("member_id", context.userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row as NextOfKin;
    }
    const { data: row, error } = await sb
      .from("next_of_kin")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as NextOfKin;
  });

export const deleteNextOfKin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("next_of_kin")
      .delete()
      .eq("id", data.id)
      .eq("member_id", context.userId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });

const uploadInput = z.object({
  doc_type: z.enum(["national_id_front", "national_id_back", "selfie", "proof_of_address", "other"]),
  filename: z.string().trim().min(1).max(160),
  mime_type: z.string().trim().min(3).max(80),
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const createKycUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => uploadInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!ALLOWED_MIMES.has(data.mime_type)) {
      throw new Error("Only JPEG, PNG or PDF files are accepted.");
    }
    const safe = sanitizeFilename(data.filename);
    const uniq = crypto.randomUUID();
    const storage_path = `${context.userId}/${uniq}-${safe}`;
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storage_path);
    if (error) throw new Error(error.message);
    return {
      storage_path,
      signed_url: signed.signedUrl,
      token: signed.token,
    };
  });

const registerInput = z.object({
  doc_type: z.enum(["national_id_front", "national_id_back", "selfie", "proof_of_address", "other"]),
  storage_path: z.string().trim().min(3).max(400),
  mime_type: z.string().trim().min(3).max(80),
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const registerKycDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => registerInput.parse(data))
  .handler(async ({ data, context }): Promise<KycDocument> => {
    const sb = context.supabase;

    // Path prefix must be caller's uid so the storage & DB RLS agree.
    if (!data.storage_path.startsWith(`${context.userId}/`)) {
      throw new Error("Invalid upload path");
    }

    const { data: row, error } = await sb
      .from("kyc_documents")
      .insert({
        member_id: context.userId,
        doc_type: data.doc_type,
        storage_path: data.storage_path,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Move profile back to pending review when a fresh document is uploaded.
    await sb
      .from("profiles")
      .update({ kyc: "pending", kyc_notes: null, kyc_reviewed_at: null, kyc_reviewed_by: null })
      .eq("id", context.userId);

    await sb.from("audit_log").insert({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "member",
      action: "kyc.document.uploaded",
      target: row.id,
      meta: { doc_type: data.doc_type, size_bytes: data.size_bytes },
    });

    return row as KycDocument;
  });

export const deleteMyPendingKycDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const { data: doc, error: fErr } = await sb
      .from("kyc_documents")
      .select("id, storage_path, status, member_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!doc || doc.member_id !== context.userId) throw new Error("Not found");
    if (doc.status !== "pending") throw new Error("This document has already been reviewed.");

    await sb.storage.from(BUCKET).remove([doc.storage_path]);
    const { error: dErr } = await sb.from("kyc_documents").delete().eq("id", data.id);
    if (dErr) throw new Error(dErr.message);
    return { deleted: true };
  });
