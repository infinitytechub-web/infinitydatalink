import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
          "id, full_name, phone, date_of_birth, gender, region, address_line, national_id, kyc, kyc_notes, kyc_reviewed_at, kyc_reviewed_by",
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

    return {
      kyc,
      review_state: reviewState,
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
