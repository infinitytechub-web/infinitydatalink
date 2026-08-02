import { writeAudit } from "@/lib/audit-log";
import { notifyStaff } from "@/lib/notify.server";
import { calculateAge } from "@/lib/age";

/** Roles that must know when a member crosses the minor/adult boundary. */
const MINOR_FLIP_ALERT_ROLES = ["super_admin", "compliance_officer"];

type Snapshot = { is_minor: boolean | null; date_of_birth: string | null };

/**
 * Compares the minor flag before/after a date-of-birth change and, when it
 * flipped, raises an internal staff alert plus an audit entry. Safe to call on
 * every profile write: it no-ops when the flag is unchanged.
 *
 * The DB trigger `profiles_set_minor_flag` recomputes `is_minor` on write, so
 * the "after" snapshot is read back from the database rather than derived.
 */
export async function alertMinorFlipIfChanged(input: {
  memberId: string;
  before: Snapshot | null | undefined;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  source: string;
}): Promise<{ flipped: boolean }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: after, error } = await supabaseAdmin
      .from("profiles")
      .select("is_minor, date_of_birth, full_name, member_no")
      .eq("id", input.memberId)
      .maybeSingle();
    if (error || !after) return { flipped: false };

    const wasMinor = input.before?.is_minor ?? null;
    const nowMinor = (after as any).is_minor as boolean | null;
    if (wasMinor === null || nowMinor === null || wasMinor === nowMinor) {
      return { flipped: false };
    }

    const dob = ((after as any).date_of_birth as string | null) ?? null;
    const name = ((after as any).full_name as string | null) ?? "A member";
    const memberNo = ((after as any).member_no as string | null) ?? null;
    const age = calculateAge(dob);
    const direction = nowMinor ? "adult_to_minor" : "minor_to_adult";
    const meta = {
      member_id: input.memberId,
      member_no: memberNo,
      direction,
      was_minor: wasMinor,
      is_minor: nowMinor,
      previous_date_of_birth: input.before?.date_of_birth ?? null,
      new_date_of_birth: dob,
      age,
      source: input.source,
    };

    await notifyStaff({
      roles: MINOR_FLIP_ALERT_ROLES,
      category: "kyc.minor_status_changed",
      title: nowMinor
        ? `Member now flagged under 18: ${name}`
        : `Member no longer under 18: ${name}`,
      body: nowMinor
        ? `${name}${memberNo ? ` (${memberNo})` : ""} updated their date of birth to ${dob ?? "unknown"}${
            age === null ? "" : ` (age ${age})`
          }. Minor safeguarding rules now apply — guardian consent and individual KYC review are required.`
        : `${name}${memberNo ? ` (${memberNo})` : ""} updated their date of birth to ${dob ?? "unknown"}${
            age === null ? "" : ` (age ${age})`
          }. Minor safeguarding restrictions no longer apply.`,
      link: `/admin/members/${input.memberId}`,
      dedupeKey: `minor-flip:${input.memberId}:${direction}:${dob ?? "none"}`,
      meta,
      excludeUserId: input.actorId ?? null,
    });

    await writeAudit({
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      actor_role: input.actorRole ?? "member",
      action: "profile.minor_status_flipped",
      target: input.memberId,
      meta,
    });

    return { flipped: true };
  } catch (err) {
    console.error("alertMinorFlipIfChanged failed", (err as Error)?.message);
    return { flipped: false };
  }
}
