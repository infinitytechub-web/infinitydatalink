// Auditor-facing reads over the scheduled-job run ledger (`cron_job_runs`).
//
// Access model: the table's RLS policy already restricts SELECT to super_admin
// and auditor, but we assert the role explicitly so a misconfigured policy can
// never silently widen the audience, and so callers get a clear error instead
// of an empty page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VIEW_ROLES = new Set(["super_admin", "auditor", "compliance_officer"]);

async function assertLedgerView(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.some((r) => VIEW_ROLES.has(r))) {
    throw new Error("Forbidden: governance or audit role required");
  }
}

export type CronRunStatus = "running" | "succeeded" | "failed";

export type CronRunRow = {
  id: string;
  job: string;
  run_key: string;
  status: CronRunStatus;
  attempt: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  caller: string | null;
  error: string | null;
  metrics: Record<string, unknown>;
};

export type CronRunPage = {
  rows: CronRunRow[];
  total: number;
  page: number;
  pageSize: number;
  jobs: string[];
};

// Hard cap on an export so a filter slip cannot pull an unbounded result set
// into the browser.
export const CRON_EXPORT_MAX = 5000;

const FilterSchema = z.object({
  job: z.string().trim().max(64).optional(),
  status: z.string().trim().max(16).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  search: z.string().trim().max(120).optional(),
});

function applyFilters(query: any, f: z.infer<typeof FilterSchema>) {
  let q = query;
  if (f.job && f.job !== "all") q = q.eq("job", f.job);
  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  if (f.from) q = q.gte("started_at", f.from);
  if (f.to) q = q.lte("started_at", f.to);
  if (f.search) {
    // Escape PostgREST `or` filter metacharacters before interpolation.
    const term = f.search.replace(/[(),*"\\]/g, " ").trim();
    if (term) q = q.or(`run_key.ilike.%${term}%,caller.ilike.%${term}%,error.ilike.%${term}%`);
  }
  return q;
}

const SELECT =
  "id, job, run_key, status, attempt, started_at, finished_at, duration_ms, caller, error, metrics";

export const listCronRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    FilterSchema.extend({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(5).max(200).default(25),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CronRunPage> => {
    await assertLedgerView(context.supabase, context.userId);

    const fromIdx = (data.page - 1) * data.pageSize;
    let q = (context.supabase as any).from("cron_job_runs").select(SELECT, { count: "exact" });
    q = applyFilters(q, data).order("started_at", { ascending: false });

    const { data: rows, error, count } = await q.range(fromIdx, fromIdx + data.pageSize - 1);
    if (error) throw new Error(error.message);

    // Distinct job names for the filter dropdown.
    const { data: jobRows } = await (context.supabase as any)
      .from("cron_job_runs")
      .select("job")
      .order("job", { ascending: true })
      .limit(1000);
    const jobs = Array.from(new Set(((jobRows ?? []) as { job: string }[]).map((r) => r.job)));

    return {
      rows: (rows ?? []) as CronRunRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      jobs,
    };
  });

/**
 * Full filtered result set for CSV/Excel export. Returns every matching row up
 * to CRON_EXPORT_MAX (paged internally so PostgREST's own row cap does not
 * silently truncate the audit export) and flags when the cap was hit.
 */
export const exportCronRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FilterSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ rows: CronRunRow[]; truncated: boolean }> => {
    await assertLedgerView(context.supabase, context.userId);

    const CHUNK = 1000;
    const rows: CronRunRow[] = [];
    for (let offset = 0; offset < CRON_EXPORT_MAX; offset += CHUNK) {
      let q = (context.supabase as any).from("cron_job_runs").select(SELECT);
      q = applyFilters(q, data).order("started_at", { ascending: false });
      const { data: chunk, error } = await q.range(offset, offset + CHUNK - 1);
      if (error) throw new Error(error.message);
      const batch = (chunk ?? []) as CronRunRow[];
      rows.push(...batch);
      if (batch.length < CHUNK) break;
    }
    return { rows: rows.slice(0, CRON_EXPORT_MAX), truncated: rows.length >= CRON_EXPORT_MAX };
  });
