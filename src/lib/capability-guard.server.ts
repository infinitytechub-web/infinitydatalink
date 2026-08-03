/**
 * Server-side capability guard. Always evaluated through the database
 * (`public.has_permission_for` → `private.has_permission`) so a client that
 * lies about its capabilities is still refused. Super admins pass implicitly
 * inside the SQL function.
 */
import type { PermAction, PermModule } from "@/lib/permissions";

type RpcClient = {
  rpc: (
    fn: "has_permission_for",
    args: { _module: string; _action: string },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function hasCapability(
  supabase: unknown,
  module: PermModule,
  action: PermAction,
): Promise<boolean> {
  const { data, error } = await (supabase as RpcClient).rpc("has_permission_for", {
    _module: module,
    _action: action,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function assertCapability(
  supabase: unknown,
  module: PermModule,
  action: PermAction,
): Promise<void> {
  if (!(await hasCapability(supabase, module, action))) {
    throw new Error(`Forbidden: ${module}.${action} permission required`);
  }
}
