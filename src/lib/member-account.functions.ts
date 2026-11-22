import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MemberAccountOverview = {
  profile: {
    full_name: string | null;
    member_no: string | null;
    phone: string | null;
    email: string | null;
    kyc: string | null;
    joined_at: string | null;
  };
  logins: Array<{ id: string; created_at: string; method: string | null; device: string }>;
  activity: Array<{ id: string; at: string; label: string; detail: string; amount: number | null; status: string | null }>;
};

function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return `${browser} on ${os}`;
}

const KIND_LABEL: Record<string, string> = {
  deposit: "Savings deposit",
  withdrawal: "Withdrawal",
  loan_disbursement: "Loan disbursed",
  loan_repayment: "Loan repayment",
  transfer: "Transfer",
  interest: "Interest",
};

/** Only ever returns the signed-in member's own data: every read is scoped to context.userId under RLS. */
export const getMyAccountOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberAccountOverview> => {
    const sb: any = context.supabase;
    const uid = context.userId;
    const [{ data: profile }, { data: logins }, { data: txns }, { data: notes }] = await Promise.all([
      sb.from("profiles").select("full_name, member_no, phone, kyc, created_at").eq("id", uid).maybeSingle(),
      sb.from("login_events").select("id, created_at, method, user_agent").eq("user_id", uid).order("created_at", { ascending: false }).limit(25),
      sb.from("transactions").select("id, ref, kind, amount, status, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(25),
      sb.from("notifications").select("id, title, body, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(15),
    ]);
    const activity = [
      ...(txns ?? []).map((t: any) => ({
        id: `t-${t.id}`,
        at: t.created_at,
        label: KIND_LABEL[t.kind] ?? t.kind,
        detail: t.ref,
        amount: Number(t.amount),
        status: t.status,
      })),
      ...(notes ?? []).map((n: any) => ({
        id: `n-${n.id}`,
        at: n.created_at,
        label: n.title,
        detail: n.body ?? "",
        amount: null,
        status: null,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
    return {
      profile: {
        full_name: profile?.full_name ?? null,
        member_no: profile?.member_no ?? null,
        phone: profile?.phone ?? null,
        email: ((context.claims as any)?.email as string | undefined) ?? null,
        kyc: profile?.kyc ?? null,
        joined_at: profile?.created_at ?? null,
      },
      logins: (logins ?? []).map((l: any) => ({ id: l.id, created_at: l.created_at, method: l.method, device: describeDevice(l.user_agent) })),
      activity,
    };
  });
