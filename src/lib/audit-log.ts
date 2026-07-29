/**
 * Single trusted write path for `public.audit_log`.
 *
 * Direct client/authenticated INSERTs are denied by RLS so members cannot forge
 * audit trail entries. All audit rows are written here from server-function
 * handlers using the service-role client, after the caller has already been
 * authenticated and role-checked.
 *
 * The admin client is imported dynamically so this module stays safe to import
 * from client-reachable `*.functions.ts` files.
 */
export type AuditEntry = {
  actor_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function writeAudit(entry: AuditEntry | AuditEntry[]): Promise<void> {
  const rows = Array.isArray(entry) ? entry : [entry];
  if (rows.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("audit_log").insert(rows as never);
  // Audit writes must never break the primary operation; surface in server logs.
  if (error) console.error("audit_log write failed", error.message);
}
