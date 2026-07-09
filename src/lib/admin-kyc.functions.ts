import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { KycDocStatus, KycDocument, NextOfKin } from "./member-profile.functions";

const KYC_ADMIN_ROLES = new Set(["super_admin", "compliance_officer"]);
const BUCKET = "kyc-documents";

async function assertKycAdmin(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  const match = roles.find((r: string) => KYC_ADMIN_ROLES.has(r));
  if (!match) throw new Error("Forbidden: compliance role required");
  return match;
}

export type KycQueueRow = {
  member_id: string;
  full_name: string | null;
  member_no: string | null;
  region: string | null;
  phone: string | null;
  national_id: string | null;
  kyc: KycDocStatus;
  kyc_reviewed_at: string | null;
  pending_docs: number;
  last_document_at: string | null;
};

export type KycQueuePage = {
  rows: KycQueueRow[];
  total: number;
  page: number;
  page_size: number;
};

export const listKycQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["all", "pending", "active", "rejected"]).default("pending"),
        q: z.string().trim().max(120).optional(),
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(5).max(100).default(25),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<KycQueuePage> => {
    await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    let q = sb
      .from("profiles")
      .select("id, full_name, member_no, region, phone, national_id, kyc, kyc_reviewed_at", { count: "exact" })
      .order("kyc_reviewed_at", { ascending: false, nullsFirst: true })
      .order("full_name", { ascending: true });

    if (data.status !== "all") q = q.eq("kyc", data.status);
    if (data.q) {
      const needle = `%${data.q}%`;
      q = q.or(`full_name.ilike.${needle},member_no.ilike.${needle},national_id.ilike.${needle}`);
    }

    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    let docStats = new Map<string, { pending: number; latest: string | null }>();
    if (ids.length) {
      const { data: docs } = await sb
        .from("kyc_documents")
        .select("member_id, status, created_at")
        .in("member_id", ids);
      for (const d of docs ?? []) {
        const cur = docStats.get((d as any).member_id) ?? { pending: 0, latest: null };
        if ((d as any).status === "pending") cur.pending += 1;
        if (!cur.latest || (d as any).created_at > cur.latest) cur.latest = (d as any).created_at;
        docStats.set((d as any).member_id, cur);
      }
    }

    return {
      rows: (rows ?? []).map((r: any) => ({
        member_id: r.id,
        full_name: r.full_name,
        member_no: r.member_no,
        region: r.region,
        phone: r.phone,
        national_id: r.national_id,
        kyc: r.kyc,
        kyc_reviewed_at: r.kyc_reviewed_at,
        pending_docs: docStats.get(r.id)?.pending ?? 0,
        last_document_at: docStats.get(r.id)?.latest ?? null,
      })),
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
  });

export type KycDocumentWithUrl = KycDocument & { signed_url: string | null };

export type MemberKycDetail = {
  profile: {
    id: string;
    full_name: string | null;
    member_no: string | null;
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
    kyc_reviewed_by: string | null;
    tier: string;
    created_at: string;
  };
  next_of_kin: NextOfKin[];
  documents: KycDocumentWithUrl[];
};

export const getMemberKyc = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ member_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<MemberKycDetail> => {
    await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const [{ data: profile, error }, { data: nok }, { data: docs }] = await Promise.all([
      sb
        .from("profiles")
        .select(
          "id, full_name, member_no, phone, national_id, region, date_of_birth, gender, digital_address, address_line, occupation, employer, kyc, kyc_notes, kyc_reviewed_at, kyc_reviewed_by, tier, created_at",
        )
        .eq("id", data.member_id)
        .maybeSingle(),
      sb
        .from("next_of_kin")
        .select("id, full_name, relationship, phone, email, national_id, address, created_at, updated_at")
        .eq("member_id", data.member_id)
        .order("created_at", { ascending: true }),
      sb
        .from("kyc_documents")
        .select("id, member_id, doc_type, storage_path, mime_type, size_bytes, status, review_notes, reviewed_at, created_at")
        .eq("member_id", data.member_id)
        .order("created_at", { ascending: false }),
    ]);

    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Member not found");

    const signedDocs: KycDocumentWithUrl[] = [];
    for (const d of (docs ?? []) as KycDocument[]) {
      const { data: sign } = await sb.storage.from(BUCKET).createSignedUrl(d.storage_path, 300);
      signedDocs.push({ ...d, signed_url: sign?.signedUrl ?? null });
    }

    return {
      profile: profile as any,
      next_of_kin: (nok ?? []) as NextOfKin[],
      documents: signedDocs,
    };
  });

const decideInput = z
  .object({
    member_id: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().max(1000).optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "rejected" && v.notes.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message: "Rejection notes must be at least 5 characters.",
      });
    }
  });

export const decideKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decideInput.parse(data))
  .handler(async ({ data, context }) => {
    const role = await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const profileKyc: "active" | "rejected" = data.decision === "approved" ? "active" : "rejected";
    const now = new Date().toISOString();

    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .update({
        kyc: profileKyc,
        kyc_notes: data.notes || null,
        kyc_reviewed_by: context.userId,
        kyc_reviewed_at: now,
      })
      .eq("id", data.member_id)
      .select("id, kyc")
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Member not found");

    const docStatus: "approved" | "rejected" = data.decision === "approved" ? "approved" : "rejected";
    const { error: dErr } = await sb
      .from("kyc_documents")
      .update({
        status: docStatus,
        review_notes: data.notes || null,
        reviewed_by: context.userId,
        reviewed_at: now,
      })
      .eq("member_id", data.member_id)
      .eq("status", "pending");
    if (dErr) throw new Error(dErr.message);

    await sb.from("audit_log").insert({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: role,
      action: data.decision === "approved" ? "kyc.approved" : "kyc.rejected",
      target: data.member_id,
      meta: { notes: data.notes || null, member_id: data.member_id },
    });

    return { member_id: data.member_id, kyc };
  });

export const signKycDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ document_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertKycAdmin(context.supabase, context.userId);
    const { data: doc, error } = await context.supabase
      .from("kyc_documents")
      .select("storage_path")
      .eq("id", data.document_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document not found");
    const { data: sign, error: sErr } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 300);
    if (sErr) throw new Error(sErr.message);
    return { signed_url: sign.signedUrl };
  });
