import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Bulk archive of log entries.
 *
 * Both RPCs are `SECURITY DEFINER`, re-check `super_admin` server-side, snapshot
 * each deleted row into `public.recycle_bin` (retained 730 days) and write a
 * `system.log_archive` audit entry, so a purge is itself auditable and
 * recoverable from the vault/recycle bin.
 */
const input = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export const archiveAuditEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { data: archived, error } = await context.supabase.rpc("archive_audit_log_entries", {
      _ids: data.ids,
    });
    if (error) throw new Error(error.message);
    return { archived: archived ?? 0 };
  });

export const archiveEventLogEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { data: archived, error } = await context.supabase.rpc("archive_runtime_error_logs", {
      _ids: data.ids,
    });
    if (error) throw new Error(error.message);
    return { archived: archived ?? 0 };
  });

/**
 * Sweep-everything variant of the archive buttons.
 *
 * It pages ids out of the target table and feeds them through the same
 * `SECURITY DEFINER` archive RPCs used by the row-level bar, so every deleted
 * row is still snapshotted into `public.recycle_bin` and still writes a
 * `system.log_archive` audit entry. Capped per call so one click cannot lock
 * the table for minutes; the UI reports how many rows moved and whether more
 * remain.
 */
const BATCH = 500;
const MAX_BATCHES = 20;

export const purgeAllLogEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: z.enum(["audit", "system"]),
        older_than_days: z.number().int().min(0).max(3650).optional().default(0),
        confirm: z.literal("PURGE"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const table = data.scope === "audit" ? "audit_log" : "runtime_error_logs";
    const tsColumn = data.scope === "audit" ? "created_at" : "occurred_at";
    const rpc = data.scope === "audit" ? "archive_audit_log_entries" : "archive_runtime_error_logs";
    const cutoff = data.older_than_days
      ? new Date(Date.now() - data.older_than_days * 86400_000).toISOString()
      : null;

    let archived = 0;
    let remaining = false;

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      let query = context.supabase
        .from(table)
        .select("id")
        .order(tsColumn, { ascending: true })
        .limit(BATCH);
      if (cutoff) query = query.lt(tsColumn, cutoff);

      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      const ids = (rows ?? []).map((r) => (r as { id: string }).id);
      if (ids.length === 0) return { archived, remaining: false };

      const { data: n, error: rpcError } = await context.supabase.rpc(rpc, { _ids: ids });
      if (rpcError) throw new Error(rpcError.message);
      archived += Number(n ?? 0);

      // Fewer rows than a full page means the table is drained for this cutoff.
      if (ids.length < BATCH) return { archived, remaining: false };
      remaining = true;
    }

    return { archived, remaining };
  });
