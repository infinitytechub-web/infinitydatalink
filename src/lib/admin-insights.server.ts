// Server-only helpers for the admin analytics dashboards. Kept out of the
// *.functions.ts module so the server-fn splitter only sees declarations.

const ADMIN_ROLES = new Set([
  "super_admin",
  "compliance_officer",
  "loan_officer",
  "finance_officer",
  "auditor",
]);

export type Granularity = "day" | "week" | "month";

export async function assertAdminRole(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => String(r.role));
  if (!roles.some((r: string) => ADMIN_ROLES.has(r))) {
    throw new Error("Forbidden: admin role required");
  }
}

export function bucketKeyOf(iso: string, granularity: Granularity) {
  const d = new Date(iso);
  if (granularity === "month") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  if (granularity === "week") {
    const day = d.getUTCDay() || 7;
    const monday = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day - 1)),
    );
    return monday.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function bucketRange(from: Date, to: Date, granularity: Granularity) {
  const keys: string[] = [];
  const end = new Date(to);
  if (granularity === "month") {
    const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (cur <= end) {
      keys.push(cur.toISOString().slice(0, 10));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  } else if (granularity === "week") {
    const start = new Date(`${bucketKeyOf(from.toISOString(), "week")}T00:00:00Z`);
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
      keys.push(d.toISOString().slice(0, 10));
    }
  } else {
    for (const d = new Date(from); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      keys.push(d.toISOString().slice(0, 10));
    }
  }
  return keys;
}

export function num(v: unknown) {
  return Number(v ?? 0) || 0;
}

export function pct(part: number, whole: number) {
  return whole <= 0 ? 0 : part / whole;
}
