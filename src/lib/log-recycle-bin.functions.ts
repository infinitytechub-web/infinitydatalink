import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Recycle bin browser + restore for purged audit and runtime event logs.
 *
 * Reads go through the caller's RLS-scoped client; restores go through
 * `SECURITY DEFINER` RPCs that re-check `super_admin`, re-insert the original
 * row into the active log, drop the snapshot and audit the restore.
 */
export type LogBinRow = {
  id: string;
  entity_table: "audit_log" | "runtime_error_logs";
  entity_id: string;
  payload: Record<string, string | number | boolean | null>;
  deleted_by: string | null;
  deleted_at: string;
  purge_after: string;
};

const listInput = z.object({
  kind: z.enum(["all", "audit_log", "runtime_error_logs"]).optional().default("all"),
  from: z.string().optional().default(""),
  to: z.string().optional().default(""),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(5).max(200).optional().default(25),
});

export const listLogRecycleBin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const tables = ["audit_log", "runtime_error_logs"] as const;
    let query = context.supabase
      .from("recycle_bin")
      .select("id, entity_table, entity_id, payload, deleted_by, deleted_at, purge_after", {
        count: "exact",
      })
      .in("entity_table", data.kind === "all" ? [...tables] : [data.kind]);

    if (data.from) query = query.gte("deleted_at", new Date(data.from).toISOString());
    if (data.to) {
      const end = new Date(new Date(data.to).getTime() + 86_400_000 - 1);
      query = query.lte("deleted_at", end.toISOString());
    }

    const start = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      count,
      error,
    } = await query
      .order("deleted_at", { ascending: false })
      .range(start, start + data.pageSize - 1);
    if (error) throw new Error(error.message);

    return { rows: (rows ?? []) as unknown as LogBinRow[], total: count ?? 0 };
  });

const restoreInput = z.object({
  kind: z.enum(["audit_log", "runtime_error_logs"]),
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export const restoreLogEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => restoreInput.parse(data))
  .handler(async ({ data, context }) => {
    const fn =
      data.kind === "audit_log" ? "restore_audit_log_entries" : "restore_runtime_error_logs";
    const { data: restored, error } = await context.supabase.rpc(fn, { _ids: data.ids });
    if (error) throw new Error(error.message);
    return { restored: Number(restored ?? 0) };
  });

const deleteInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  confirm: z.literal("DELETE"),
});

/**
 * Permanent, irreversible removal of recycle-bin snapshots. Super-admin only
 * (re-checked inside the `SECURITY DEFINER` RPC), and every call writes a final
 * `system.log_permanent_delete` audit entry listing what was destroyed.
 */
export const deleteLogEntriesForever = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: deleted, error } = await context.supabase.rpc("delete_log_recycle_bin_entries", {
      _ids: data.ids,
    });
    if (error) throw new Error(error.message);
    return { deleted: Number(deleted ?? 0) };
  });
