import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit-log";
import {
  REMEDIATION_PROFILE_FIELDS,
  parseRemediationItems,
  type RemediationProfileField,
} from "@/lib/kyc-remediation";
import { normalizePhone } from "@/lib/member-registration";
import type { ProfileKycStatus } from "./member-profile.functions";

export type KycStepState = "todo" | "in_progress" | "done";

export type KycReviewState = "not_started" | "in_review" | "approved" | "rejected";

export type MyKycStatus = {
  kyc: ProfileKycStatus;
  review_state: KycReviewState;
  steps: {
    profile: KycStepState;
    documents: KycStepState;
    review: KycStepState;
  };
  profile_missing_fields: string[];
  documents_missing_types: string[];
  latest_decision: {
    decision: "approved" | "rejected";
    notes: string | null;
    reviewed_at: string;
    reviewer_name: string | null;
  } | null;
  next_action: { label: string; link: string } | null;
  /** Reviewer-requested revisions for a rejected submission. */
  remediation: Array<{
    key: string;
    kind: "profile" | "document";
    field: string | null;
    doc_type: string | null;
    label: string;
    resolved: boolean;
    current_value: string | null;
  }>;
  can_resubmit: boolean;
  resubmitted_at: string | null;
  notifications: Array<{
    id: string;
    channel: "email" | "sms";
    decision: string;
    status: string;
    sent_at: string | null;
    created_at: string;
  }>;
};

const REQUIRED_PROFILE_FIELDS = [
  "full_name",
  "phone",
  "date_of_birth",
  "gender",
  "region",
  "address_line",
  "national_id",
] as const;

const REQUIRED_DOC_TYPES = ["national_id_front", "national_id_back", "selfie"] as const;

export const getMyKycStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyKycStatus> => {
    const sb = context.supabase;
    const uid = context.userId;

    const [{ data: profile }, { data: docs }, { data: notifs }] = await Promise.all([
      sb
        .from("profiles")
        .select(
          "id, full_name, phone, date_of_birth, gender, region, address_line, digital_address, occupation, employer, national_id, kyc, kyc_notes, kyc_reviewed_at, kyc_reviewed_by, kyc_remediation_items, kyc_resubmitted_at",
        )
        .eq("id", uid)
        .maybeSingle(),
      sb.from("kyc_documents").select("doc_type, status, created_at").eq("member_id", uid),
      sb
        .from("kyc_notifications")
        .select("id, channel, decision, status, sent_at, created_at")
        .eq("member_id", uid)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const kyc = (profile?.kyc ?? "pending") as ProfileKycStatus;

    const missingFields = REQUIRED_PROFILE_FIELDS.filter(
      (f) => !(profile as any)?.[f] || String((profile as any)[f]).trim() === "",
    ) as string[];
    const submittedTypes = new Set((docs ?? []).map((d: any) => d.doc_type as string));
    const missingDocTypes = REQUIRED_DOC_TYPES.filter((t) => !submittedTypes.has(t));

    const profileStep: KycStepState =
      missingFields.length === 0 ? "done" : missingFields.length < REQUIRED_PROFILE_FIELDS.length ? "in_progress" : "todo";
    const documentsStep: KycStepState =
      missingDocTypes.length === 0 ? "done" : submittedTypes.size > 0 ? "in_progress" : "todo";

    let reviewState: KycReviewState = "not_started";
    let reviewStep: KycStepState = "todo";
    if (kyc === "active") {
      reviewState = "approved";
      reviewStep = "done";
    } else if (kyc === "rejected") {
      reviewState = "rejected";
      reviewStep = "done";
    } else if (documentsStep === "done") {
      reviewState = "in_review";
      reviewStep = "in_progress";
    }

    // Reviewer name (only shown on approval per privacy note)
    let reviewerName: string | null = null;
    if (kyc === "active" && profile?.kyc_reviewed_by) {
      const { data: reviewer } = await sb
        .from("profiles")
        .select("full_name")
        .eq("id", profile.kyc_reviewed_by)
        .maybeSingle();
      reviewerName = (reviewer as any)?.full_name ?? null;
    }

    const latest_decision =
      profile?.kyc_reviewed_at && (kyc === "active" || kyc === "rejected")
        ? {
            decision: (kyc === "active" ? "approved" : "rejected") as "approved" | "rejected",
            notes: profile?.kyc_notes ?? null,
            reviewed_at: profile.kyc_reviewed_at,
            reviewer_name: reviewerName,
          }
        : null;

    let next_action: MyKycStatus["next_action"] = null;
    if (profileStep !== "done") {
      next_action = { label: "Complete your personal details", link: "/app/profile" };
    } else if (documentsStep !== "done") {
      next_action = { label: "Upload the required KYC documents", link: "/app/profile" };
    } else if (reviewState === "rejected") {
      next_action = { label: "Update your profile and resubmit", link: "/app/profile" };
    } else if (reviewState === "in_review") {
      next_action = { label: "Sit tight — a compliance officer is reviewing your submission.", link: "/app/kyc" };
    }

    // Reviewer-requested revisions. A profile item counts as resolved once the
    // field has a value; a document item once a fresh file was uploaded after
    // the rejection timestamp.
    const reviewedAt = (profile as any)?.kyc_reviewed_at as string | null;
    const remediationItems = parseRemediationItems((profile as any)?.kyc_remediation_items);
    const remediation = remediationItems.map((item) => {
      if (item.kind === "profile") {
        const raw = (profile as any)?.[item.field];
        const value = raw == null ? null : String(raw).trim() || null;
        return {
          key: item.key,
          kind: "profile" as const,
          field: item.field as string,
          doc_type: null,
          label: item.label,
          resolved: value != null,
          current_value: value,
        };
      }
      const fresh = (docs ?? []).some(
        (d: any) =>
          d.doc_type === item.docType &&
          (!reviewedAt || new Date(d.created_at).getTime() > new Date(reviewedAt).getTime()),
      );
      return {
        key: item.key,
        kind: "document" as const,
        field: null,
        doc_type: item.docType as string,
        label: item.label,
        resolved: fresh,
        current_value: null,
      };
    });

    const canResubmit =
      kyc === "rejected" && remediation.length > 0 && remediation.every((r) => r.resolved);

    if (kyc === "rejected") {
      next_action = remediation.some((r) => !r.resolved)
        ? { label: "Revise the requested items and resubmit", link: "/app/kyc" }
        : { label: "Resubmit your verification for review", link: "/app/kyc" };
    }

    return {
      kyc,
      review_state: reviewState,
      remediation,
      can_resubmit: canResubmit,
      resubmitted_at: ((profile as any)?.kyc_resubmitted_at as string | null) ?? null,
      steps: { profile: profileStep, documents: documentsStep, review: reviewStep },
      profile_missing_fields: missingFields,
      documents_missing_types: [...missingDocTypes],
      latest_decision,
      next_action,
      notifications: (notifs ?? []).map((n: any) => ({
        id: n.id,
        channel: n.channel,
        decision: n.decision,
        status: n.status,
        sent_at: n.sent_at,
        created_at: n.created_at,
      })),
    };
  });


// --- Resubmission flow -----------------------------------------------------

const FIELD_MAX = 160;

const fieldValueSchema = z.string().trim().min(2).max(FIELD_MAX);

const saveInput = z.object({
  values: z.record(z.string(), fieldValueSchema),
});

/**
 * Saves revisions for reviewer-requested profile fields only. Any key that the
 * reviewer did not ask for is rejected, so this cannot be used as a generic
 * profile-write bypass.
 */
export const saveKycRemediationFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("kyc, kyc_remediation_items")
      .eq("id", context.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Profile not found");
    if (profile.kyc !== "rejected") {
      throw new Error("There are no requested revisions on your verification.");
    }

    const requested = new Set(
      parseRemediationItems((profile as any).kyc_remediation_items)
        .filter((i) => i.kind === "profile")
        .map((i) => (i as { field: RemediationProfileField }).field as string),
    );

    const patch: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.values)) {
      if (!requested.has(key)) {
        throw new Error(`"${key}" was not requested by the reviewer.`);
      }
      if (!REMEDIATION_PROFILE_FIELDS.includes(key as RemediationProfileField)) {
        throw new Error(`"${key}" is not an editable verification field.`);
      }
      if (key === "phone") {
        const normalized = normalizePhone(value);
        if (!normalized) throw new Error("Enter a valid Ghanaian phone number.");
        patch[key] = normalized;
        continue;
      }
      if (key === "date_of_birth" && Number.isNaN(Date.parse(value))) {
        throw new Error("Enter a valid date of birth.");
      }
      patch[key] = value;
    }
    if (Object.keys(patch).length === 0) return { updated: false as const };

    const { error } = await sb.from("profiles").update(patch as any).eq("id", context.userId);
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "member",
      action: "kyc.remediation.field_updated",
      target: context.userId,
      meta: { fields: Object.keys(patch) },
    });

    return { updated: true as const, fields: Object.keys(patch) };
  });

const resubmitInput = z.object({
  note: z.string().trim().max(500).optional().default(""),
});

/**
 * Sends a rejected verification back for review. Every reviewer-requested item
 * must be addressed first; the check is re-run server-side here so the client
 * cannot skip items.
 */
export const resubmitMyKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resubmitInput.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const [{ data: profile, error: pErr }, { data: docs }] = await Promise.all([
      sb
        .from("profiles")
        .select(
          "kyc, kyc_reviewed_at, kyc_remediation_items, full_name, phone, date_of_birth, gender, region, address_line, digital_address, occupation, employer, national_id",
        )
        .eq("id", context.userId)
        .maybeSingle(),
      sb.from("kyc_documents").select("doc_type, created_at").eq("member_id", context.userId),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Profile not found");
    if (profile.kyc !== "rejected") {
      throw new Error("Only a rejected verification can be resubmitted.");
    }

    const items = parseRemediationItems((profile as any).kyc_remediation_items);
    if (items.length === 0) {
      throw new Error("No requested revisions are on file — contact support.");
    }
    const reviewedAt = (profile as any).kyc_reviewed_at as string | null;

    const outstanding = items.filter((item) => {
      if (item.kind === "profile") {
        const raw = (profile as any)[item.field];
        return raw == null || String(raw).trim() === "";
      }
      return !(docs ?? []).some(
        (d: any) =>
          d.doc_type === item.docType &&
          (!reviewedAt || new Date(d.created_at).getTime() > new Date(reviewedAt).getTime()),
      );
    });
    if (outstanding.length > 0) {
      throw new Error(`Still outstanding: ${outstanding.map((i) => i.label).join(", ")}.`);
    }

    const { error } = await sb.rpc("resubmit_own_kyc", { _note: data.note || null } as never);
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "member",
      action: "kyc.resubmitted",
      target: context.userId,
      meta: { items: items.map((i) => i.key), note: data.note || null },
    });

    return { ok: true as const };
  });
