/**
 * Automated reminders for incomplete minor guardian consent.
 *
 * A minor (under-18) KYC review cannot be decided until the account has:
 *   1. an eligible guardian on file (parent/guardian next-of-kin with a phone),
 *   2. a signed guardian consent attachment, and
 *   3. a completed safeguarding attestation attachment.
 *
 * This job scans pending minor reviews, works out which of those are still
 * missing, and reminds both sides:
 *   * compliance staff (super_admin / compliance_officer) in-app + email, with
 *     a deep link straight to the member review screen, and
 *   * the guardian on the account, through the member's own notification
 *     preferences (in-app + email + SMS), deep-linked to the KYC screen.
 *
 * Runs are idempotent per member per UTC day: outbox rows are deduped by key
 * and in-app inserts are skipped when the same reminder already exists today.
 */
import { notifyStaff, notifyUser } from "@/lib/notify.server";
import { eligibleGuardians, type GuardianCandidate } from "@/lib/kyc-minor-rules";

const STAFF_ROLES = ["super_admin", "compliance_officer"];
const STAFF_CATEGORY = "kyc.minor.consent_pending";
const GUARDIAN_CATEGORY = "account.kyc.guardian_consent_pending";

export type MissingItem = "guardian" | "guardian_consent" | "safeguarding_attestation";

export const MISSING_LABEL: Record<MissingItem, string> = {
  guardian: "verified guardian on file (parent/guardian next-of-kin with a phone number)",
  guardian_consent: "signed guardian consent attachment",
  safeguarding_attestation: "safeguarding attestation attachment",
};

export type GuardianConsentGap = {
  member_id: string;
  member_label: string;
  missing: MissingItem[];
};

export type GuardianConsentReminderResult = {
  scanned: number;
  incomplete: number;
  staff_notified: number;
  guardians_notified: number;
  gaps: GuardianConsentGap[];
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Scans pending minor KYC reviews and sends reminders for anything still
 * missing. Safe to call repeatedly — a member is reminded at most once per day.
 */
export async function runGuardianConsentReminders(): Promise<GuardianConsentReminderResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as any;
  const day = todayKey();

  const { data: minors, error } = await sb
    .from("profiles")
    .select("id, full_name, member_no, kyc")
    .eq("is_minor", true)
    .in("kyc", ["pending", "rejected"])
    .limit(1000);
  if (error) throw new Error(error.message);

  const rows = (minors ?? []) as any[];
  const result: GuardianConsentReminderResult = {
    scanned: rows.length,
    incomplete: 0,
    staff_notified: 0,
    guardians_notified: 0,
    gaps: [],
  };
  if (rows.length === 0) return result;

  const ids = rows.map((r) => r.id as string);

  const [{ data: nok }, { data: docs }] = await Promise.all([
    sb.from("next_of_kin").select("id, member_id, full_name, relationship, phone").in("member_id", ids),
    sb
      .from("kyc_documents")
      .select("member_id, doc_type")
      .in("member_id", ids)
      .in("doc_type", ["guardian_consent", "safeguarding_attestation"]),
  ]);

  const nokByMember = new Map<string, GuardianCandidate[]>();
  for (const n of (nok ?? []) as any[]) {
    const list = nokByMember.get(n.member_id) ?? [];
    list.push({ id: n.id, full_name: n.full_name, relationship: n.relationship, phone: n.phone });
    nokByMember.set(n.member_id, list);
  }

  const docsByMember = new Map<string, Set<string>>();
  for (const d of (docs ?? []) as any[]) {
    const set = docsByMember.get(d.member_id) ?? new Set<string>();
    set.add(d.doc_type);
    docsByMember.set(d.member_id, set);
  }

  for (const member of rows) {
    const memberId = member.id as string;
    const label =
      [member.full_name, member.member_no].filter(Boolean).join(" · ") || `Member ${memberId.slice(0, 8)}`;

    const guardians = eligibleGuardians(nokByMember.get(memberId) ?? []);
    const attached = docsByMember.get(memberId) ?? new Set<string>();

    const missing: MissingItem[] = [];
    if (guardians.length === 0) missing.push("guardian");
    if (!attached.has("guardian_consent")) missing.push("guardian_consent");
    if (!attached.has("safeguarding_attestation")) missing.push("safeguarding_attestation");
    if (missing.length === 0) continue;

    result.incomplete += 1;
    result.gaps.push({ member_id: memberId, member_label: label, missing });

    const missingText = missing.map((m) => MISSING_LABEL[m]).join("; ");
    const guardianName = guardians[0]?.full_name ?? null;

    // ---- Compliance staff: deep link to the member review screen -----------
    const staffLink = `/admin/members/${memberId}`;
    const alreadyStaff = await sb
      .from("notifications")
      .select("id")
      .eq("category", STAFF_CATEGORY)
      .eq("link", staffLink)
      .gte("created_at", `${day}T00:00:00Z`)
      .limit(1);
    if (((alreadyStaff.data ?? []) as any[]).length === 0) {
      const staff = await notifyStaff({
        roles: STAFF_ROLES,
        category: STAFF_CATEGORY,
        title: `Guardian consent incomplete — ${label}`,
        body: `This minor account cannot be decided yet. Still outstanding: ${missingText}. Open the member review screen to upload the attestations or add the guardian.`,
        link: staffLink,
        meta: { member_id: memberId, missing, day },
        dedupeKey: `${STAFF_CATEGORY}:${memberId}:${day}`,
        channels: ["in_app", "email"],
      });
      result.staff_notified += staff.recipients;
    }

    // ---- Guardian (via the minor's account contact) ------------------------
    const guardianLink = "/app/kyc";
    const alreadyGuardian = await sb
      .from("notifications")
      .select("id")
      .eq("user_id", memberId)
      .eq("category", GUARDIAN_CATEGORY)
      .gte("created_at", `${day}T00:00:00Z`)
      .limit(1);
    if (((alreadyGuardian.data ?? []) as any[]).length === 0) {
      const fan = await notifyUser({
        userId: memberId,
        category: GUARDIAN_CATEGORY,
        title: "Guardian consent still needed",
        body: `${guardianName ? `${guardianName}: ` : ""}verification of this under-18 account is on hold until the guardian paperwork is complete. Outstanding: ${missingText}.`,
        link: guardianLink,
        meta: { member_id: memberId, missing, day },
        dedupeKey: `${GUARDIAN_CATEGORY}:${memberId}:${day}`,
        channels: ["in_app", "email", "sms"],
      });
      if (fan.delivered.length > 0) result.guardians_notified += 1;
    }
  }

  return result;
}
