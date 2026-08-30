import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_ROLES = new Set([
  "super_admin",
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "auditor",
]);

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.some((r: string) => ADMIN_ROLES.has(r))) {
    throw new Error("Forbidden: admin role required");
  }
}

export type PendingApproval = {
  id: string;
  ref: string;
  product: string;
  amount: number;
  created_at: string;
  member_name: string | null;
  member_no: string | null;
  user_id: string;
};

export type ActivityEntry = {
  id: string;
  created_at: string;
  action: string;
  actor_email: string | null;
  actor_role: string | null;
  target: string | null;
};

export type AdminOverview = {
  members_total: number;
  members_new_30d: number;
  savings_aum: number;
  savings_delta_mom: number;
  loans_active_principal: number;
  loans_on_time_rate: number;
  pending_loans: number;
  pending_withdrawals: number;
  recent_activity: ActivityEntry[];
  pending_approvals: PendingApproval[];
};

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const [
      membersTotalRes,
      membersNewRes,
      savingsRes,
      loansRes,
      pendingLoansRes,
      thisMonthTxRes,
      prevMonthTxRes,
      recentActivityRes,
      pendingApprovalsRes,
    ] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }),
      sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo),
      sb.from("savings_accounts").select("balance"),
      sb.from("loans").select("amount, status, decided_at, created_at"),
      sb.from("loans").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb
        .from("transactions")
        .select("amount, kind")
        .eq("status", "cleared")
        .gte("created_at", monthStart),
      sb
        .from("transactions")
        .select("amount, kind")
        .eq("status", "cleared")
        .gte("created_at", prevMonthStart)
        .lt("created_at", monthStart),
      sb
        .from("audit_log")
        .select("id, created_at, action, actor_email, actor_role, target")
        .order("created_at", { ascending: false })
        .limit(8),
      sb
        .from("loans")
        .select("id, ref, product, amount, created_at, user_id")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const savings_aum = (savingsRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.balance ?? 0),
      0,
    );

    const netContributions = (rows: any[] | null) => {
      if (!rows) return 0;
      return rows.reduce((s, r) => {
        const amt = Number(r.amount ?? 0);
        if (r.kind === "deposit") return s + amt;
        if (r.kind === "withdrawal") return s - amt;
        return s;
      }, 0);
    };
    const thisMonth = netContributions(thisMonthTxRes.data);
    const prevMonth = netContributions(prevMonthTxRes.data);
    const savings_delta_mom = prevMonth === 0 ? 0 : (thisMonth - prevMonth) / Math.abs(prevMonth);

    const loans = loansRes.data ?? [];
    const loans_active_principal = loans
      .filter((l: any) => l.status === "approved" || l.status === "active")
      .reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0);

    const approved = loans.filter(
      (l: any) => l.status === "approved" || l.status === "active" || l.status === "closed",
    );
    const loans_on_time_rate =
      approved.length === 0
        ? 1
        : approved.filter((l: any) => l.status !== "rejected").length / approved.length;

    const pendingUserIds = Array.from(
      new Set((pendingApprovalsRes.data ?? []).map((l: any) => l.user_id)),
    );
    let profileMap = new Map<string, { full_name: string | null; member_no: string | null }>();
    if (pendingUserIds.length) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, full_name, member_no")
        .in("id", pendingUserIds);
      profileMap = new Map(
        (profiles ?? []).map((p: any) => [
          p.id,
          { full_name: p.full_name, member_no: p.member_no },
        ]),
      );
    }

    return {
      members_total: membersTotalRes.count ?? 0,
      members_new_30d: membersNewRes.count ?? 0,
      savings_aum,
      savings_delta_mom,
      loans_active_principal,
      loans_on_time_rate,
      pending_loans: pendingLoansRes.count ?? 0,
      pending_withdrawals: 0,
      recent_activity: (recentActivityRes.data ?? []).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        action: r.action,
        actor_email: r.actor_email,
        actor_role: r.actor_role,
        target: r.target,
      })),
      pending_approvals: (pendingApprovalsRes.data ?? []).map((l: any) => ({
        id: l.id,
        ref: l.ref,
        product: l.product,
        amount: Number(l.amount),
        created_at: l.created_at,
        user_id: l.user_id,
        member_name: profileMap.get(l.user_id)?.full_name ?? null,
        member_no: profileMap.get(l.user_id)?.member_no ?? null,
      })),
    };
  });

export type ReportBucket = {
  bucket: string;
  new_members: number;
  contributions: number;
  disbursements: number;
  repayments: number;
};

export type ReportTotals = {
  new_members: number;
  contributions: number;
  disbursements: number;
  repayments: number;
};

export type LoanStatusMix = { status: string; count: number };
export type TopProduct = { product: string; count: number; total: number };

export type AdminReport = {
  from: string;
  to: string;
  granularity: "day" | "week" | "month";
  series: ReportBucket[];
  totals: ReportTotals;
  loan_status_mix: LoanStatusMix[];
  top_products: TopProduct[];
};

function bucketKey(iso: string, granularity: "day" | "week" | "month") {
  const d = new Date(iso);
  if (granularity === "day") {
    return d.toISOString().slice(0, 10);
  }
  if (granularity === "month") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  // week: Monday of ISO week (UTC)
  const day = d.getUTCDay() || 7;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day - 1)),
  );
  return monday.toISOString().slice(0, 10);
}

function enumerateBuckets(from: Date, to: Date, granularity: "day" | "week" | "month") {
  const keys: string[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  if (granularity === "month") {
    cur.setUTCDate(1);
    while (cur <= end) {
      keys.push(bucketKey(cur.toISOString(), "month"));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  } else if (granularity === "week") {
    const startKey = bucketKey(cur.toISOString(), "week");
    const start = new Date(`${startKey}T00:00:00Z`);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
      keys.push(d.toISOString().slice(0, 10));
    }
  } else {
    for (let d = new Date(cur); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      keys.push(d.toISOString().slice(0, 10));
    }
  }
  return keys;
}

export const getReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        granularity: z.enum(["day", "week", "month"]).default("day"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<AdminReport> => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    const fromISO = new Date(data.from).toISOString();
    const toISO = new Date(new Date(data.to).getTime() + 24 * 3600 * 1000 - 1).toISOString();

    const [membersRes, txRes, loansRes] = await Promise.all([
      sb.from("profiles").select("created_at").gte("created_at", fromISO).lte("created_at", toISO),
      sb
        .from("transactions")
        .select("amount, kind, status, created_at")
        .eq("status", "cleared")
        .gte("created_at", fromISO)
        .lte("created_at", toISO),
      sb
        .from("loans")
        .select("amount, product, status, decided_at, created_at")
        .gte("created_at", fromISO)
        .lte("created_at", toISO),
    ]);

    const buckets = enumerateBuckets(new Date(data.from), new Date(data.to), data.granularity);
    const map = new Map<string, ReportBucket>();
    for (const k of buckets) {
      map.set(k, { bucket: k, new_members: 0, contributions: 0, disbursements: 0, repayments: 0 });
    }
    const add = (iso: string, field: keyof Omit<ReportBucket, "bucket">, value: number) => {
      const k = bucketKey(iso, data.granularity);
      const row = map.get(k) ?? {
        bucket: k,
        new_members: 0,
        contributions: 0,
        disbursements: 0,
        repayments: 0,
      };
      row[field] = row[field] + value;
      map.set(k, row);
    };

    for (const p of membersRes.data ?? []) add((p as any).created_at, "new_members", 1);
    for (const t of txRes.data ?? []) {
      const amt = Number((t as any).amount ?? 0);
      const kind = (t as any).kind as string;
      if (kind === "deposit") add((t as any).created_at, "contributions", amt);
      else if (kind === "loan_repayment") add((t as any).created_at, "repayments", amt);
    }
    for (const l of loansRes.data ?? []) {
      const amt = Number((l as any).amount ?? 0);
      if (
        (l as any).status === "approved" ||
        (l as any).status === "active" ||
        (l as any).status === "closed"
      ) {
        const when = (l as any).decided_at ?? (l as any).created_at;
        if (when) add(when, "disbursements", amt);
      }
    }

    const series = Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
    const totals: ReportTotals = series.reduce(
      (t, r) => ({
        new_members: t.new_members + r.new_members,
        contributions: t.contributions + r.contributions,
        disbursements: t.disbursements + r.disbursements,
        repayments: t.repayments + r.repayments,
      }),
      { new_members: 0, contributions: 0, disbursements: 0, repayments: 0 },
    );

    const statusMix = new Map<string, number>();
    const productMix = new Map<string, { count: number; total: number }>();
    for (const l of loansRes.data ?? []) {
      const s = (l as any).status as string;
      statusMix.set(s, (statusMix.get(s) ?? 0) + 1);
      const p = (l as any).product as string;
      const cur = productMix.get(p) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number((l as any).amount ?? 0);
      productMix.set(p, cur);
    }

    return {
      from: data.from,
      to: data.to,
      granularity: data.granularity,
      series,
      totals,
      loan_status_mix: Array.from(statusMix.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      top_products: Array.from(productMix.entries())
        .map(([product, v]) => ({ product, count: v.count, total: v.total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8),
    };
  });
