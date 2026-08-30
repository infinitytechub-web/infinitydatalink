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

/**
 * Organisation scope → member user ids.
 *
 * Analytics fact tables (`transactions`, `loans`,
 * `savings_withdrawal_requests`) are keyed by `user_id`, so an entity scope is
 * resolved to the entity's active membership list and applied as an `IN`
 * filter. Returns `null` for the institution-wide scope ("all") and `[]` when
 * the entity has no members (which yields empty analytics rather than
 * unscoped totals).
 */
export async function resolveScopeUserIds(
  supabase: any,
  entityId: string | null | undefined,
): Promise<string[] | null> {
  if (!entityId || entityId === "all") return null;
  const { data, error } = await supabase
    .from("entity_memberships")
    .select("profile_id")
    .eq("entity_id", entityId);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r: any) => String(r.profile_id)).filter(Boolean)));
}

/** Applies an optional `user_id IN (...)` scope filter to a PostgREST builder. */
export function scoped<T>(query: T, userIds: string[] | null, column = "user_id"): T {
  if (!userIds) return query;
  return (query as any).in(column, userIds.length ? userIds : [NO_MATCH_UUID]) as T;
}

/** Sentinel used so an empty scope returns zero rows instead of every row. */
export const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000";

export function pct(part: number, whole: number) {
  return whole <= 0 ? 0 : part / whole;
}
