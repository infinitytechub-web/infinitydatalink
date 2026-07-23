import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { KycDocStatus, KycDocument, NextOfKin, ProfileKycStatus } from "./member-profile.functions";

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
  kyc: ProfileKycStatus;
  kyc_reviewed_at: string | null;
  kyc_assigned_to: string | null;
  kyc_assigned_name: string | null;
  kyc_notes: string | null;
  pending_docs: number;
  last_document_at: string | null;
  // Waiting-since anchor for SLA: earliest pending doc's created_at,
  // falling back to profile.updated_at. Null when not pending.
  pending_since: string | null;
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
        assignee: z.string().max(64).optional(), // 'any' | 'me' | 'unassigned' | uuid
        aging: z.enum(["any", "fresh", "due_soon", "overdue", "critical"]).default("any"),
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(5).max(100).default(25),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<KycQueuePage> => {
    await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    // For pending queues we sort by oldest submission first so the SLA is
    // visible; other statuses keep the recent-decision-first order.
    const isPending = data.status === "pending";
    let q = sb
      .from("profiles")
      .select(
        "id, full_name, member_no, region, phone, national_id, kyc, kyc_notes, kyc_reviewed_at, kyc_assigned_to, updated_at",
        { count: "exact" },
      );
    q = isPending
      ? q.order("updated_at", { ascending: true }).order("full_name", { ascending: true })
      : q.order("kyc_reviewed_at", { ascending: false, nullsFirst: true }).order("full_name", { ascending: true });

    if (data.status !== "all") q = q.eq("kyc", data.status);
    if (data.q) {
      const needle = `%${data.q.replace(/[%,()*]/g, "")}%`;
      q = q.or(`full_name.ilike.${needle},member_no.ilike.${needle},national_id.ilike.${needle}`);
    }

    const assignee = data.assignee ?? "any";
    if (assignee === "me") q = q.eq("kyc_assigned_to", context.userId);
    else if (assignee === "unassigned") q = q.is("kyc_assigned_to", null);
    else if (assignee !== "any") q = q.eq("kyc_assigned_to", assignee);

    // DB-side aging filter using profile.updated_at as the anchor.
    // Only meaningful for pending members.
    if (data.aging !== "any" && isPending) {
      const now = Date.now();
      const H = 3_600_000;
      const ranges: Record<string, [number, number | null]> = {
        fresh: [0, 24],
        due_soon: [24, 48],
        overdue: [48, 120],
        critical: [120, null],
      };
      const [minH, maxH] = ranges[data.aging];
      // updated_at older than minH hours ago:
      q = q.lte("updated_at", new Date(now - minH * H).toISOString());
      if (maxH != null) {
        q = q.gt("updated_at", new Date(now - maxH * H).toISOString());
      }
    }

    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    const docStats = new Map<
      string,
      { pending: number; latest: string | null; earliest_pending: string | null }
    >();
    if (ids.length) {
      const { data: docs } = await sb
        .from("kyc_documents")
        .select("member_id, status, created_at")
        .in("member_id", ids);
      for (const d of docs ?? []) {
        const cur = docStats.get((d as any).member_id) ?? {
          pending: 0,
          latest: null,
          earliest_pending: null,
        };
        const ca = (d as any).created_at as string;
        if ((d as any).status === "pending") {
          cur.pending += 1;
          if (!cur.earliest_pending || ca < cur.earliest_pending) cur.earliest_pending = ca;
        }
        if (!cur.latest || ca > cur.latest) cur.latest = ca;
        docStats.set((d as any).member_id, cur);
      }
    }

    // Resolve assignee display names
    const assigneeIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.kyc_assigned_to).filter(Boolean)),
    ) as string[];
    const nameMap = new Map<string, string>();
    if (assigneeIds.length) {
      const { data: reviewers } = await sb
        .from("profiles")
        .select("id, full_name")
        .in("id", assigneeIds);
      for (const r of reviewers ?? []) nameMap.set((r as any).id, (r as any).full_name ?? "—");
    }

    return {
      rows: (rows ?? []).map((r: any) => {
        const stats = docStats.get(r.id);
        const isPend = r.kyc === "pending";
        const pendingSince = isPend
          ? (stats?.earliest_pending ?? r.updated_at ?? null)
          : null;
        return {
          member_id: r.id,
          full_name: r.full_name,
          member_no: r.member_no,
          region: r.region,
          phone: r.phone,
          national_id: r.national_id,
          kyc: r.kyc,
          kyc_reviewed_at: r.kyc_reviewed_at,
          kyc_assigned_to: r.kyc_assigned_to ?? null,
          kyc_assigned_name: r.kyc_assigned_to ? (nameMap.get(r.kyc_assigned_to) ?? null) : null,
          kyc_notes: r.kyc_notes ?? null,
          pending_docs: stats?.pending ?? 0,
          last_document_at: stats?.latest ?? null,
          pending_since: pendingSince,
        };
      }),
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
    kyc: ProfileKycStatus;
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

    // Fire-and-log notification email (never fails the decision)
    try {
      const { sendKycDecisionEmail } = await import("@/lib/email/send-kyc-notification.server");
      const res = await sendKycDecisionEmail(sb, {
        memberId: data.member_id,
        decision: data.decision,
        reviewerNote: data.notes || null,
        reviewedAt: now,
      });
      if (!res.ok) {
        await sb.from("audit_log").insert({
          actor_id: context.userId,
          actor_email: (context.claims as any)?.email ?? null,
          actor_role: role,
          action: "kyc.notification_failed",
          target: data.member_id,
          meta: { error: res.error ?? res.skipped ?? "unknown" },
        });
      }
    } catch (err: any) {
      console.error("kyc notification error", err);
    }

    return { member_id: data.member_id, kyc: profileKyc };
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

// ============================================================================
// Summary + assignment + bulk decisions
// ============================================================================

export type KycAgingBuckets = {
  fresh: number;
  due_soon: number;
  overdue: number;
  critical: number;
};

export type KycSummary = {
  pending: number;
  active: number;
  rejected: number;
  unassigned_pending: number;
  assigned_to_me: number;
  decided_today: number;
  breached: number; // pending & older than SLA target (72h)
  oldest_pending_at: string | null;
  aging: KycAgingBuckets;
};

export const getKycSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KycSummary> => {
    await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const countBy = async (col: string, value: any, extra?: (q: any) => any) => {
      let q = sb.from("profiles").select("id", { count: "exact", head: true }).eq(col, value);
      if (extra) q = extra(q);
      const { count } = await q;
      return count ?? 0;
    };
    const now = Date.now();
    const H = 3_600_000;
    const dayAgo = new Date(now - 24 * H).toISOString();
    const t24 = new Date(now - 24 * H).toISOString();
    const t48 = new Date(now - 48 * H).toISOString();
    const t72 = new Date(now - 72 * H).toISOString();
    const t120 = new Date(now - 120 * H).toISOString();

    const pendingCount = (extra: (q: any) => any) =>
      countBy("kyc", "pending", extra);

    const [
      pending,
      active,
      rejected,
      unassignedPending,
      mine,
      decidedToday,
      fresh,
      dueSoon,
      overdue,
      critical,
      breached,
      oldest,
    ] = await Promise.all([
      countBy("kyc", "pending"),
      countBy("kyc", "active"),
      countBy("kyc", "rejected"),
      countBy("kyc", "pending", (q) => q.is("kyc_assigned_to", null)),
      countBy("kyc_assigned_to", context.userId, (q) => q.eq("kyc", "pending")),
      (async () => {
        const { count } = await sb
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .in("kyc", ["active", "rejected"])
          .gte("kyc_reviewed_at", dayAgo);
        return count ?? 0;
      })(),
      pendingCount((q) => q.gt("updated_at", t24)),
      pendingCount((q) => q.lte("updated_at", t24).gt("updated_at", t48)),
      pendingCount((q) => q.lte("updated_at", t48).gt("updated_at", t120)),
      pendingCount((q) => q.lte("updated_at", t120)),
      pendingCount((q) => q.lte("updated_at", t72)),
      (async () => {
        const { data } = await sb
          .from("profiles")
          .select("updated_at")
          .eq("kyc", "pending")
          .order("updated_at", { ascending: true })
          .limit(1);
        return (data?.[0] as any)?.updated_at ?? null;
      })(),
    ]);

    return {
      pending,
      active,
      rejected,
      unassigned_pending: unassignedPending,
      assigned_to_me: mine,
      decided_today: decidedToday,
      breached,
      oldest_pending_at: oldest,
      aging: { fresh, due_soon: dueSoon, overdue, critical },
    };
  });

export type KycReviewer = { id: string; name: string; role: string };

export const listKycReviewers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KycReviewer[]> => {
    await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const { data: roles, error } = await sb
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["super_admin", "compliance_officer"]);
    if (error) throw new Error(error.message);

    const byUser = new Map<string, string>();
    for (const r of roles ?? []) {
      const uid = (r as any).user_id as string;
      const role = (r as any).role as string;
      // Prefer compliance_officer label when both roles are present.
      if (!byUser.has(uid) || role === "compliance_officer") byUser.set(uid, role);
    }
    const ids = Array.from(byUser.keys());
    if (!ids.length) return [];

    const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", ids);
    const nameMap = new Map<string, string>();
    for (const p of profs ?? []) nameMap.set((p as any).id, (p as any).full_name ?? "—");

    return ids
      .map((id) => ({ id, name: nameMap.get(id) ?? "—", role: byUser.get(id) as string }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

export const assignKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        member_ids: z.array(z.string().uuid()).min(1).max(100),
        assignee_id: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const role = await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    const now = new Date().toISOString();

    const { error } = await sb
      .from("profiles")
      .update({
        kyc_assigned_to: data.assignee_id,
        kyc_assigned_at: data.assignee_id ? now : null,
      })
      .in("id", data.member_ids);
    if (error) throw new Error(error.message);

    const auditRows = data.member_ids.map((id) => ({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: role,
      action: data.assignee_id ? "kyc.assigned" : "kyc.unassigned",
      target: id,
      meta: { assignee_id: data.assignee_id },
    }));
    await sb.from("audit_log").insert(auditRows);

    return { updated: data.member_ids.length };
  });

const bulkDecideInput = z
  .object({
    member_ids: z.array(z.string().uuid()).min(1).max(50),
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

export const bulkDecideKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bulkDecideInput.parse(data))
  .handler(async ({ data, context }) => {
    const role = await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    const profileKyc: "active" | "rejected" = data.decision === "approved" ? "active" : "rejected";
    const docStatus: "approved" | "rejected" = data.decision === "approved" ? "approved" : "rejected";
    const now = new Date().toISOString();

    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];

    const { sendKycDecisionEmail } = await import("@/lib/email/send-kyc-notification.server");

    for (const memberId of data.member_ids) {
      try {
        const { data: prof, error: pErr } = await sb
          .from("profiles")
          .update({
            kyc: profileKyc,
            kyc_notes: data.notes || null,
            kyc_reviewed_by: context.userId,
            kyc_reviewed_at: now,
          })
          .eq("id", memberId)
          .select("id")
          .maybeSingle();
        if (pErr || !prof) throw new Error(pErr?.message ?? "Member not found");

        await sb
          .from("kyc_documents")
          .update({
            status: docStatus,
            review_notes: data.notes || null,
            reviewed_by: context.userId,
            reviewed_at: now,
          })
          .eq("member_id", memberId)
          .eq("status", "pending");

        await sb.from("audit_log").insert({
          actor_id: context.userId,
          actor_email: (context.claims as any)?.email ?? null,
          actor_role: role,
          action: `kyc.bulk_${data.decision}`,
          target: memberId,
          meta: { notes: data.notes || null, member_id: memberId },
        });

        // Enqueue notification
        try {
          const res = await sendKycDecisionEmail(sb, {
            memberId,
            decision: data.decision,
            reviewerNote: data.notes || null,
            reviewedAt: now,
          });
          if (!res.ok) {
            await sb.from("audit_log").insert({
              actor_id: context.userId,
              actor_email: (context.claims as any)?.email ?? null,
              actor_role: role,
              action: "kyc.notification_failed",
              target: memberId,
              meta: { error: res.error ?? res.skipped ?? "unknown" },
            });
          }
        } catch (err: any) {
          console.error("kyc bulk notification error", err);
        }

        succeeded.push(memberId);
      } catch (err: any) {
        failed.push({ id: memberId, error: err?.message ?? String(err) });
      }
    }

    return { succeeded: succeeded.length, failed };
  });

