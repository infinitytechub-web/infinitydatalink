import { writeAudit } from "@/lib/audit-log";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { KycDocStatus, KycDocument, NextOfKin, ProfileKycStatus } from "./member-profile.functions";
import { notifyStaff, notifyUser } from "@/lib/notify.server";
import {
  ALL_REMEDIATION_ITEMS,
  REMEDIATION_DOC_TYPES,
  REMEDIATION_KEYS,
  REMEDIATION_PROFILE_FIELDS,
  parseRemediationItems,
  remediationLabel,
} from "@/lib/kyc-remediation";
import {
  assessResubmissionRisk,
  meetsFlagThreshold,
  type RiskAssessment,
  type RiskSeverity,
} from "@/lib/kyc-risk-rules";
import {
  MINOR_BULK_BLOCKED_REASON,
  evaluateMinorGuardrails,
  minorReviewSchema,
  type GuardianCandidate,
  type MinorReview,
} from "@/lib/kyc-minor-rules";



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
  date_of_birth: string | null;
  is_minor: boolean;
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
        "id, full_name, member_no, region, phone, national_id, date_of_birth, is_minor, kyc, kyc_notes, kyc_reviewed_at, kyc_assigned_to, updated_at",
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
          date_of_birth: (r.date_of_birth as string | null) ?? null,
          is_minor: Boolean(r.is_minor),
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
    national_id_type: string | null;
    region: string | null;
    district: string | null;
    date_of_birth: string | null;
    is_minor: boolean;

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
  next_of_kin: NextOfKinAdminView[];
  documents: KycDocumentWithUrl[];
};

/**
 * Staff-facing projection of a next-of-kin record. The raw `national_id` is
 * never sent to the browser: compliance reviewers only need enough of it to
 * match against an uploaded ID document, so the value is masked server-side.
 */
export type NextOfKinAdminView = Omit<NextOfKin, "national_id"> & {
  national_id_masked: string | null;
};

function maskNationalId(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const tail = raw.slice(-4);
  return `•••• ${tail}`;
}


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
          "id, full_name, member_no, phone, national_id, national_id_type, region, district, date_of_birth, is_minor, gender, digital_address, address_line, occupation, employer, kyc, kyc_notes, kyc_reviewed_at, kyc_reviewed_by, tier, created_at",
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
      next_of_kin: ((nok ?? []) as NextOfKin[]).map(({ national_id, ...rest }) => ({
        ...rest,
        national_id_masked: maskNationalId(national_id),
      })),

      documents: signedDocs,
    };
  });

const decideInput = z
  .object({
    member_id: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().max(1000).optional().default(""),
    // Which specific items the member must revise before resubmitting.
    remediation_items: z
      .array(z.enum(REMEDIATION_KEYS as [string, ...string[]]))
      .max(20)
      .optional()
      .default([]),
    /** Extra guardian checklist — mandatory when the member is a minor. */
    minor_review: minorReviewSchema.optional(),
    /** Fresh re-authentication proof — mandatory when the member is a minor. */
    step_up_token: z.string().min(16).max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "rejected" && v.notes.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message: "Rejection notes must be at least 5 characters.",
      });
    }
    if (v.decision === "rejected" && v.remediation_items.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remediation_items"],
        message: "Select at least one item the member must revise.",
      });
    }
  });

/**
 * Enforces the minor-specific review steps. Returns audit-ready metadata when
 * the member is a minor, or null for ordinary adult reviews.
 */
async function enforceMinorReview(
  sb: { from: (t: string) => any },
  opts: {
    memberId: string;
    decision: "approved" | "rejected";
    notes: string;
    minorReview?: MinorReview;
    stepUpToken?: string;
    officerId: string;
  },
): Promise<{ guardian: GuardianCandidate; review: MinorReview; step_up_id: string } | null> {
  const [{ data: prof }, { data: nok }] = await Promise.all([
    sb.from("profiles").select("id, is_minor, date_of_birth").eq("id", opts.memberId).maybeSingle(),
    sb.from("next_of_kin").select("id, full_name, relationship, phone").eq("member_id", opts.memberId),
  ]);
  if (!prof) throw new Error("Member not found");
  if (!(prof as any).is_minor) return null;

  const nextOfKin = (nok ?? []) as GuardianCandidate[];
  const { blockers } = evaluateMinorGuardrails({
    isMinor: true,
    decision: opts.decision,
    notes: opts.notes,
    minorReview: opts.minorReview ?? null,
    nextOfKin,
  });
  if (blockers.length > 0) {
    throw new Error(`Minor account review incomplete — ${blockers.join(" ")}`);
  }

  const { assertStepUp } = await import("@/lib/step-up.server");
  const proof = await assertStepUp(
    opts.officerId,
    opts.stepUpToken,
    `${opts.decision === "approved" ? "approve" : "reject"} KYC for a minor account`,
  );

  const guardian = nextOfKin.find((g) => g.id === opts.minorReview!.guardian_nok_id)!;
  return { guardian, review: opts.minorReview!, step_up_id: proof.id };
}


/**
 * Resubmission window + attempt allowance applied when a KYC review is rejected.
 * Reads the shared settings row so compliance can retune it without a deploy.
 * Approvals clear the window and reset the counter.
 */
async function resubmissionStamp(
  sb: { from: (t: string) => any },
  decision: "approved" | "rejected",
) {
  if (decision === "approved") {
    return {
      kyc_resubmission_deadline: null,
      kyc_max_attempts: null,
      kyc_attempts: 0,
    };
  }
  const { data: settings } = await sb
    .from("kyc_resubmission_settings")
    .select("deadline_days, max_attempts")
    .maybeSingle();
  const days = Number(settings?.deadline_days ?? 14);
  return {
    kyc_resubmission_deadline: new Date(Date.now() + days * 86400_000).toISOString(),
    kyc_max_attempts: Number(settings?.max_attempts ?? 3),
  };
}

/**
 * Captures the state a reviewer actually saw when rejecting, so a later
 * resubmission can be diffed field-by-field and file-by-file. Stored on the
 * profile row because it is decision evidence, not member-editable data.
 */
async function captureRejectionSnapshot(
  sb: { from: (t: string) => any },
  memberId: string,
): Promise<any> {
  const [{ data: prof }, { data: docs }] = await Promise.all([
    sb
      .from("profiles")
      .select(REMEDIATION_PROFILE_FIELDS.join(", "))
      .eq("id", memberId)
      .maybeSingle(),
    sb
      .from("kyc_documents")
      .select("id, doc_type, storage_path, size_bytes, mime_type, created_at")
      .eq("member_id", memberId),
  ]);
  if (!prof) return null;

  // Keep only the newest upload per doc type — that is the one under review.
  const latest = new Map<string, any>();
  for (const d of (docs ?? []) as any[]) {
    const cur = latest.get(d.doc_type);
    if (!cur || String(d.created_at) > String(cur.created_at)) latest.set(d.doc_type, d);
  }

  return {
    captured_at: new Date().toISOString(),
    fields: Object.fromEntries(
      REMEDIATION_PROFILE_FIELDS.map((f) => [f, ((prof as any)[f] ?? null) as string | null]),
    ),
    documents: Object.fromEntries(
      Array.from(latest.entries()).map(([type, d]) => [
        type,
        {
          id: d.id as string,
          storage_path: d.storage_path as string,
          size_bytes: d.size_bytes as number | null,
          mime_type: d.mime_type as string | null,
          created_at: d.created_at as string,
        },
      ]),
    ),
  };
}

export const decideKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decideInput.parse(data))
  .handler(async ({ data, context }) => {
    const role = await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const profileKyc: "active" | "rejected" = data.decision === "approved" ? "active" : "rejected";
    const now = new Date().toISOString();

    // Minor accounts: guardian checklist + longer note + fresh re-authentication
    // are enforced before anything is written.
    const minor = await enforceMinorReview(sb, {
      memberId: data.member_id,
      decision: data.decision,
      notes: data.notes,
      minorReview: data.minor_review,
      stepUpToken: data.step_up_token,
      officerId: context.userId,
    });



    const remediation = data.decision === "rejected" ? Array.from(new Set(data.remediation_items)) : [];
    const window = await resubmissionStamp(sb, data.decision);
    const snapshot =
      data.decision === "rejected" ? await captureRejectionSnapshot(sb, data.member_id) : null;

    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .update({
        kyc: profileKyc,
        kyc_notes: data.notes || null,
        kyc_reviewed_by: context.userId,
        kyc_reviewed_at: now,
        kyc_remediation_items: remediation,
        kyc_rejection_snapshot: snapshot,
        ...window,
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

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: role,
      action:
        minor
          ? data.decision === "approved"
            ? "kyc.minor_approved"
            : "kyc.minor_rejected"
          : data.decision === "approved"
            ? "kyc.approved"
            : "kyc.rejected",
      target: data.member_id,
      meta: {
        notes: data.notes || null,
        member_id: data.member_id,
        remediation_items: remediation,
        is_minor: !!minor,
        ...(minor
          ? {
              minor_review: {
                guardian_nok_id: minor.review.guardian_nok_id,
                guardian_name: minor.guardian.full_name,
                guardian_relationship: minor.guardian.relationship,
                guardian_consent_ref: minor.review.guardian_consent_ref,
                guardian_id_verified: minor.review.guardian_id_verified,
                safeguarding_ack: minor.review.safeguarding_ack,
              },
              step_up_id: minor.step_up_id,
            }
          : {}),
      },
    });

    // Second-line visibility: every minor decision is broadcast to compliance
    // leadership so it can be re-reviewed after the fact.
    if (minor) {
      await notifyStaff({
        roles: ["super_admin", "compliance_officer"],
        category: "kyc.minor.decision",
        title: `Minor KYC ${data.decision} — secondary review required`,
        body: `A minor account was ${data.decision} by ${role}. Guardian: ${minor.guardian.full_name ?? "unknown"} (${minor.guardian.relationship ?? "n/a"}), consent ref ${minor.review.guardian_consent_ref}.`,
        link: `/admin/members/${data.member_id}`,
        meta: { member_id: data.member_id, decision: data.decision, guardian_nok_id: minor.review.guardian_nok_id },
        dedupeKey: `kyc.minor.${data.decision}:${data.member_id}:${now}`,
        excludeUserId: context.userId,
      });
    }


    // In-app + email/SMS fan-out per the member's notification preferences.
    const fanOut = await notifyUser({
      userId: data.member_id,
      category: data.decision === "approved" ? "account.kyc.approved" : "account.kyc.rejected",
      title: data.decision === "approved" ? "KYC verification approved" : "KYC verification declined",
      body:
        data.decision === "approved"
          ? "Your identity verification has been approved. Your full member dashboard is now unlocked."
          : `Your identity verification could not be approved.${data.notes ? ` Reviewer note: ${data.notes}` : ""} Items to revise: ${remediation.map(remediationLabel).join(", ")}.`,
      link: "/app/kyc",
      // The branded decision email is sent below via the transactional template,
      // so the generic outbox only handles in-app + SMS.
      channels: ["in_app", "sms"],
      meta: { notes: data.notes || null, decision: data.decision, remediation_items: remediation },
      dedupeKey: `kyc.${data.decision}:${data.member_id}:${now}`,
    });

    // Mirror the queued SMS into the member-visible notification timeline.
    if (fanOut.delivered.includes("sms")) {
      const { data: contact } = await sb
        .from("profiles")
        .select("phone")
        .eq("id", data.member_id)
        .maybeSingle();
      await sb.from("kyc_notifications").insert({
        member_id: data.member_id,
        channel: "sms",
        decision: data.decision,
        recipient: contact?.phone ?? "unknown",
        subject: null,
        status: "pending",
      });
    }

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
        await writeAudit({
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
    await writeAudit(auditRows);

    return { updated: data.member_ids.length };
  });

const bulkDecideInput = z
  .object({
    member_ids: z.array(z.string().uuid()).min(1).max(50),
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().max(1000).optional().default(""),
    remediation_items: z
      .array(z.enum(REMEDIATION_KEYS as [string, ...string[]]))
      .max(20)
      .optional()
      .default([]),
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
    const remediation =
      data.decision === "rejected"
        ? Array.from(
            new Set(
              data.remediation_items.length > 0
                ? data.remediation_items
                : REMEDIATION_DOC_TYPES.map((t) => `document:${t}`),
            ),
          )
        : [];

    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];
    const window = await resubmissionStamp(sb, data.decision);

    // Minors are never decided in bulk — each needs guardian verification and a
    // re-authenticated, individually audited decision.
    const { data: minorRows } = await sb
      .from("profiles")
      .select("id")
      .in("id", data.member_ids as never)
      .eq("is_minor", true);
    const minorIds = new Set(((minorRows ?? []) as any[]).map((r) => r.id as string));
    for (const id of minorIds) failed.push({ id, error: MINOR_BULK_BLOCKED_REASON });

    const { sendKycDecisionEmail } = await import("@/lib/email/send-kyc-notification.server");

    for (const memberId of data.member_ids) {
      if (minorIds.has(memberId)) continue;
      try {
        const snapshot =

          data.decision === "rejected" ? await captureRejectionSnapshot(sb, memberId) : null;
        const { data: prof, error: pErr } = await sb
          .from("profiles")
          .update({
            kyc: profileKyc,
            kyc_notes: data.notes || null,
            kyc_reviewed_by: context.userId,
            kyc_reviewed_at: now,
            kyc_remediation_items: remediation,
            kyc_rejection_snapshot: snapshot,
            ...window,
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

        await writeAudit({
          actor_id: context.userId,
          actor_email: (context.claims as any)?.email ?? null,
          actor_role: role,
          action: `kyc.bulk_${data.decision}`,
          target: memberId,
          meta: { notes: data.notes || null, member_id: memberId, remediation_items: remediation },
        });

        const fanOut = await notifyUser({
          userId: memberId,
          category: data.decision === "approved" ? "account.kyc.approved" : "account.kyc.rejected",
          title: data.decision === "approved" ? "KYC verification approved" : "KYC verification declined",
          body:
            data.decision === "approved"
              ? "Your identity verification has been approved. Your full member dashboard is now unlocked."
              : `Your identity verification could not be approved.${data.notes ? ` Reviewer note: ${data.notes}` : ""} Items to revise: ${remediation.map(remediationLabel).join(", ")}.`,
          link: "/app/kyc",
          channels: ["in_app", "sms"],
          meta: { notes: data.notes || null, decision: data.decision, remediation_items: remediation },
          dedupeKey: `kyc.${data.decision}:${memberId}:${now}`,
        });

        if (fanOut.delivered.includes("sms")) {
          const { data: contact } = await sb
            .from("profiles")
            .select("phone")
            .eq("id", memberId)
            .maybeSingle();
          await sb.from("kyc_notifications").insert({
            member_id: memberId,
            channel: "sms",
            decision: data.decision,
            recipient: contact?.phone ?? "unknown",
            subject: null,
            status: "pending",
          });
        }

        // Enqueue notification
        try {
          const res = await sendKycDecisionEmail(sb, {
            memberId,
            decision: data.decision,
            reviewerNote: data.notes || null,
            reviewedAt: now,
          });
          if (!res.ok) {
            await writeAudit({
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


export type KycResubmissionSettings = {
  deadline_days: number;
  max_attempts: number;
  enforce_deadline: boolean;
  /** Auto-flag resubmissions for re-review when risk patterns match. */
  auto_flag_enabled: boolean;
  /** Lowest risk level that triggers an automatic flag. */
  auto_flag_min_severity: RiskSeverity;
  /** Send automated deadline / low-attempt reminders to members. */
  reminder_enabled: boolean;
  /** Days before the deadline the first reminder goes out. */
  reminder_lead_days: number;
  /** Warn the member once remaining attempts drop to this many or fewer. */
  low_attempts_threshold: number;
  updated_at: string | null;
};

export const getKycResubmissionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KycResubmissionSettings> => {
    await assertKycAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("kyc_resubmission_settings")
      .select(
        "deadline_days, max_attempts, enforce_deadline, auto_flag_enabled, auto_flag_min_severity, reminder_enabled, reminder_lead_days, low_attempts_threshold, updated_at",
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      deadline_days: Number(data?.deadline_days ?? 14),
      max_attempts: Number(data?.max_attempts ?? 3),
      enforce_deadline: (data?.enforce_deadline ?? true) as boolean,
      auto_flag_enabled: ((data as any)?.auto_flag_enabled ?? true) as boolean,
      auto_flag_min_severity: (((data as any)?.auto_flag_min_severity ?? "medium") as RiskSeverity),
      reminder_enabled: ((data as any)?.reminder_enabled ?? true) as boolean,
      reminder_lead_days: Number((data as any)?.reminder_lead_days ?? 3),
      low_attempts_threshold: Number((data as any)?.low_attempts_threshold ?? 1),
      updated_at: (data?.updated_at as string | null) ?? null,
    };
  });

export const updateKycResubmissionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        deadline_days: z.number().int().min(1).max(365),
        max_attempts: z.number().int().min(1).max(20),
        enforce_deadline: z.boolean(),
        auto_flag_enabled: z.boolean().default(true),
        auto_flag_min_severity: z.enum(["low", "medium", "high"]).default("medium"),
        reminder_enabled: z.boolean().default(true),
        reminder_lead_days: z.number().int().min(0).max(60).default(3),
        low_attempts_threshold: z.number().int().min(0).max(20).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await assertKycAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("kyc_resubmission_settings")
      .update({
        deadline_days: data.deadline_days,
        max_attempts: data.max_attempts,
        enforce_deadline: data.enforce_deadline,
        auto_flag_enabled: data.auto_flag_enabled,
        auto_flag_min_severity: data.auto_flag_min_severity,
        reminder_enabled: data.reminder_enabled,
        reminder_lead_days: data.reminder_lead_days,
        low_attempts_threshold: data.low_attempts_threshold,
        updated_by: context.userId,
      } as any)
      .eq("id", true);
    if (error) throw new Error(error.message);



    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: role,
      action: "kyc.resubmission_settings.updated",
      target: "kyc_resubmission_settings",
      meta: { ...data },
    });

    return { ok: true as const };
  });

export type KycDiffRow = {
  key: string;
  kind: "profile" | "document";
  label: string;
  requested: boolean;
  changed: boolean;
  /** Value / file the reviewer saw at rejection time. */
  before: string | null;
  /** Current value / file after the member's revisions. */
  after: string | null;
  before_url: string | null;
  after_url: string | null;
  before_at: string | null;
  after_at: string | null;
};

export type KycResubmissionDiff = {
  member_id: string;
  has_snapshot: boolean;
  captured_at: string | null;
  reviewed_at: string | null;
  resubmitted_at: string | null;
  attempts_used: number;
  rows: KycDiffRow[];
  changed_count: number;
  unchanged_requested_count: number;
  /** Risk patterns detected on this resubmission. */
  risk: RiskAssessment;
  /** Auto-flag configuration in force when the diff was computed. */
  auto_flag: { enabled: boolean; min_severity: RiskSeverity };
  /** Set when this resubmission is currently flagged for re-review. */
  flagged_at: string | null;
  flag_reason: string | null;
};


/**
 * Field-by-field and file-by-file comparison between what a reviewer rejected
 * and what the member resubmitted. Requested items are listed first so the
 * reviewer can confirm each flagged item actually moved.
 */
export const getKycResubmissionDiff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ member_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<KycResubmissionDiff> => {
    const role = await assertKycAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const [{ data: profile, error }, { data: docs }, { data: flagSettings }] = await Promise.all([
      sb
        .from("profiles")
        .select(
          `${REMEDIATION_PROFILE_FIELDS.join(", ")}, kyc_remediation_items, kyc_rejection_snapshot, kyc_reviewed_at, kyc_resubmitted_at, kyc_attempts, kyc_flagged_at, kyc_flag_reason, kyc_risk_level`,
        )

        .eq("id", data.member_id)
        .maybeSingle(),
      sb
        .from("kyc_documents")
        .select("id, doc_type, storage_path, size_bytes, mime_type, created_at")
        .eq("member_id", data.member_id)
        .order("created_at", { ascending: false }),
      sb
        .from("kyc_resubmission_settings")
        .select("auto_flag_enabled, auto_flag_min_severity")
        .maybeSingle(),
    ]);

    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Member not found");

    const snapshot = ((profile as any).kyc_rejection_snapshot ?? null) as any;
    const snapFields = (snapshot?.fields ?? {}) as Record<string, string | null>;
    const snapDocs = (snapshot?.documents ?? {}) as Record<string, any>;
    const requested = new Set(
      parseRemediationItems((profile as any).kyc_remediation_items).map((i) => i.key),
    );

    const latestDoc = new Map<string, any>();
    for (const d of (docs ?? []) as any[]) {
      if (!latestDoc.has(d.doc_type)) latestDoc.set(d.doc_type, d);
    }

    const sign = async (path: string | null | undefined) => {
      if (!path) return null;
      const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(path, 300);
      return s?.signedUrl ?? null;
    };

    const fileLabel = (d: any | null) =>
      d ? `${d.storage_path.split("/").pop()} (${Math.round(Number(d.size_bytes ?? 0) / 1024)} KB)` : null;

    const rows: KycDiffRow[] = [];
    for (const item of ALL_REMEDIATION_ITEMS) {
      if (item.kind === "profile") {
        const before = snapshot ? ((snapFields[item.field] ?? null) as string | null) : null;
        const after = ((profile as any)[item.field] ?? null) as string | null;
        rows.push({
          key: item.key,
          kind: "profile",
          label: item.label,
          requested: requested.has(item.key),
          changed: Boolean(snapshot) && (before ?? "") !== (after ?? ""),
          before,
          after,
          before_url: null,
          after_url: null,
          before_at: null,
          after_at: null,
        });
        continue;
      }
      const beforeDoc = snapDocs[item.docType] ?? null;
      const afterDoc = latestDoc.get(item.docType) ?? null;
      const changed =
        Boolean(snapshot) &&
        (beforeDoc?.id ?? null) !== (afterDoc?.id ?? null);
      rows.push({
        key: item.key,
        kind: "document",
        label: item.label,
        requested: requested.has(item.key),
        changed,
        before: fileLabel(beforeDoc),
        after: fileLabel(afterDoc),
        before_url: await sign(beforeDoc?.storage_path),
        after_url: await sign(afterDoc?.storage_path),
        before_at: (beforeDoc?.created_at as string | null) ?? null,
        after_at: (afterDoc?.created_at as string | null) ?? null,
      });
    }

    // Requested items first, then anything else that moved.
    rows.sort((a, b) => Number(b.requested) - Number(a.requested) || Number(b.changed) - Number(a.changed));

    const attemptsUsed = Number((profile as any).kyc_attempts ?? 0);
    const resubmittedAt = ((profile as any).kyc_resubmitted_at as string | null) ?? null;

    const risk = assessResubmissionRisk({
      rows: rows.map((r) => ({
        key: r.key,
        kind: r.kind,
        label: r.label,
        requested: r.requested,
        changed: r.changed,
        before: r.before,
        after: r.after,
      })),
      attempts_used: attemptsUsed,
      has_snapshot: Boolean(snapshot),
    });

    const autoFlag = {
      enabled: (flagSettings?.auto_flag_enabled ?? true) as boolean,
      min_severity: ((flagSettings?.auto_flag_min_severity ?? "medium") as RiskSeverity),
    };

    let flaggedAt = ((profile as any).kyc_flagged_at as string | null) ?? null;
    let flagReason = ((profile as any).kyc_flag_reason as string | null) ?? null;

    // Auto-flag for re-review: only once the member has actually resubmitted,
    // and only when the detected level reaches the configured threshold.
    const shouldFlag =
      autoFlag.enabled &&
      Boolean(resubmittedAt) &&
      meetsFlagThreshold(risk.level, autoFlag.min_severity);
    const alreadyFlagged =
      flaggedAt !== null && resubmittedAt !== null && flaggedAt >= resubmittedAt;

    if (shouldFlag && !alreadyFlagged) {
      const now = new Date().toISOString();
      const { error: flagErr } = await sb
        .from("profiles")
        .update({
          kyc_flagged_at: now,
          kyc_flag_reason: risk.summary,
          kyc_risk_level: risk.level,
          kyc_risk_flags: risk.flags as any,
        })
        .eq("id", data.member_id);
      if (!flagErr) {
        flaggedAt = now;
        flagReason = risk.summary;
        await writeAudit({
          actor_id: context.userId,
          actor_email: (context.claims as any)?.email ?? null,
          actor_role: role,
          action: "kyc.resubmission.auto_flagged",
          target: data.member_id,
          meta: {
            risk_level: risk.level,
            min_severity: autoFlag.min_severity,
            codes: risk.flags.map((f) => f.code),
            flags: risk.flags,
            attempts_used: attemptsUsed,
            resubmitted_at: resubmittedAt,
          },
        });

        // Internal signal to compliance staff — matched patterns + severity inline
        // so the alert is actionable straight from the notifications centre.
        const memberLabel =
          ((profile as any).full_name as string | null) ??
          ((profile as any).email as string | null) ??
          data.member_id;
        await notifyStaff({
          roles: ["super_admin", "compliance_officer"],
          category: "kyc.resubmission.auto_flagged",
          title: `KYC resubmission flagged for re-review — ${memberLabel}`,
          body: `Severity: ${risk.level.toUpperCase()}. ${risk.summary}${
            risk.flags.length ? ` (${risk.flags.map((f) => f.code).join(", ")})` : ""
          }`,
          link: `/admin/members/${data.member_id}`,
          meta: {
            member_id: data.member_id,
            risk_level: risk.level,
            min_severity: autoFlag.min_severity,
            codes: risk.flags.map((f) => f.code),
            flags: risk.flags,
            resubmitted_at: resubmittedAt,
            attempts_used: attemptsUsed,
          },
          dedupeKey: `kyc-autoflag:${data.member_id}:${resubmittedAt ?? now}`,
          excludeUserId: context.userId,
        });
      }
    } else if (!shouldFlag && risk.level === "none" && flaggedAt && resubmittedAt && flaggedAt >= resubmittedAt) {
      // Patterns cleared on a newer diff — drop the stale flag.
      await sb
        .from("profiles")
        .update({ kyc_flagged_at: null, kyc_flag_reason: null, kyc_risk_level: "none", kyc_risk_flags: [] as any })
        .eq("id", data.member_id);
      flaggedAt = null;
      flagReason = null;
    }

    return {
      member_id: data.member_id,
      has_snapshot: Boolean(snapshot),
      captured_at: (snapshot?.captured_at as string | null) ?? null,
      reviewed_at: ((profile as any).kyc_reviewed_at as string | null) ?? null,
      resubmitted_at: resubmittedAt,
      attempts_used: attemptsUsed,
      rows,
      changed_count: rows.filter((r) => r.changed).length,
      unchanged_requested_count: rows.filter((r) => r.requested && !r.changed).length,
      risk,
      auto_flag: autoFlag,
      flagged_at: flaggedAt,
      flag_reason: flagReason,
    };
  });


export type MinorStatusChange = {
  id: string;
  member_id: string;
  was_minor: boolean | null;
  is_minor: boolean;
  previous_date_of_birth: string | null;
  source_date_of_birth: string | null;
  change_kind: string;
  changed_by: string | null;
  changed_at: string;
};

/**
 * Automatic under-18 flag history for one member, newest first. Written by the
 * `profiles_set_minor_flag` trigger, so it covers every write path (member
 * edits, KYC remediation, staff tools and direct database changes).
 */
export const listMinorStatusChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ member_id: z.string().uuid(), limit: z.number().int().min(1).max(100).default(20) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("minor_status_changes")
      .select("id, member_id, was_minor, is_minor, previous_date_of_birth, source_date_of_birth, change_kind, changed_by, changed_at")
      .eq("member_id", data.member_id)
      .order("changed_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { changes: (rows ?? []) as MinorStatusChange[] };
  });

/**
 * Delete a member's KYC review entry (super admins and admins only).
 *
 * This clears the review queue record — the uploaded KYC documents (storage
 * objects and rows), the reviewer decision, remediation checklist, rejection
 * snapshot and resubmission counters — and returns the member to an
 * un-submitted `pending` state so they can start over. The member account
 * itself is never touched.
 *
 * Restricted to `super_admin` / `admin` roles AND the `kyc.delete`
 * capability, requires a written reason, and is fully audit-logged.
 */
export const deleteKycReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        member_id: z.string().uuid(),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertCapability } = await import("@/lib/capability-guard.server");
    const sb = context.supabase;

    const { data: roleRows, error: rErr } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rErr) throw new Error(rErr.message);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    const actorRole = roles.find((r) => r === "super_admin" || r === "admin");
    if (!actorRole) throw new Error("Forbidden: super_admin or admin role required");
    await assertCapability(sb, "kyc", "delete");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("id, full_name, member_no, kyc")
      .eq("id", data.member_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Member not found");

    const { data: docs, error: dErr } = await admin
      .from("kyc_documents")
      .select("id, storage_path, doc_type")
      .eq("member_id", data.member_id);
    if (dErr) throw new Error(dErr.message);

    const paths = (docs ?? []).map((d: any) => d.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await admin.storage.from(BUCKET).remove(paths);
      const { error: delErr } = await admin
        .from("kyc_documents")
        .delete()
        .eq("member_id", data.member_id);
      if (delErr) throw new Error(delErr.message);
    }

    const { error: uErr } = await admin
      .from("profiles")
      .update({
        kyc: "pending",
        kyc_notes: null,
        kyc_reviewed_by: null,
        kyc_reviewed_at: null,
        kyc_assigned_to: null,
        kyc_assigned_at: null,
        kyc_submitted_at: null,
        kyc_resubmitted_at: null,
        kyc_resubmission_deadline: null,
        kyc_attempts: 0,
        kyc_remediation_items: [],
        kyc_rejection_snapshot: null,
        kyc_risk_level: null,
        kyc_risk_flags: null,
        kyc_flagged_at: null,
        kyc_flag_reason: null,
        kyc_deadline_reminded_at: null,
        kyc_final_reminded_at: null,
        kyc_low_attempts_reminded_at: null,
        kyc_deadline_expired_notified_at: null,
      })
      .eq("id", data.member_id);
    if (uErr) throw new Error(uErr.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: actorRole,
      action: "kyc.review_deleted",
      target: data.member_id,
      meta: {
        member_id: data.member_id,
        member_no: profile.member_no ?? null,
        member_name: profile.full_name ?? null,
        previous_kyc: profile.kyc,
        reason: data.reason,
        documents_deleted: (docs ?? []).length,
        document_types: (docs ?? []).map((d: any) => d.doc_type),
      },
    });

    await notifyStaff({
      roles: ["super_admin", "compliance_officer"],
      category: "kyc.review.deleted",
      title: "KYC review record deleted",
      body: `${profile.full_name ?? profile.member_no ?? data.member_id} had their KYC review deleted by ${actorRole}. Reason: ${data.reason}`,
      link: `/admin/members/${data.member_id}`,
      meta: { member_id: data.member_id, reason: data.reason },
      dedupeKey: `kyc.review.deleted:${data.member_id}:${Date.now()}`,
      excludeUserId: context.userId,
    });

    return { deleted: true, documents_deleted: (docs ?? []).length };
  });
