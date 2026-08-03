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
