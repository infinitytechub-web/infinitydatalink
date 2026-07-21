import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RetentionPolicy = {
  auto_purge_enabled: boolean;
  retention_error_days: number;
  retention_warning_days: number;
  retention_info_days: number;
  last_purge_at: string | null;
  last_purge_deleted: number | null;
  updated_at: string;
};

export type RetentionPreviewRow = {
  severity: "error" | "warning" | "info";
  retention_days: number;
  cutoff: string;
  rows_total: number;
  rows_to_delete: number;
  rows_to_keep: number;
  bytes_to_delete: number;
  bytes_to_keep: number;
};

const daysSchema = z.number().int().min(1).max(3650);

export const getLogRetention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("runtime_log_retention")
      .select("auto_purge_enabled, retention_error_days, retention_warning_days, retention_info_days, last_purge_at, last_purge_deleted, updated_at")
      .eq("id", 1)
      .single();
    if (error) throw new Error(error.message);
    return data as RetentionPolicy;
  });

export const updateLogRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        auto_purge_enabled: z.boolean(),
        retention_error_days: daysSchema,
        retention_warning_days: daysSchema,
        retention_info_days: daysSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("runtime_log_retention")
      .update(data)
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const previewLogRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        error_days: daysSchema.optional(),
        warning_days: daysSchema.optional(),
        info_days: daysSchema.optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("preview_runtime_log_retention", {
      _error_days: data.error_days,
      _warning_days: data.warning_days,
      _info_days: data.info_days,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as RetentionPreviewRow[];
  });

export const runManualLogPurge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("PURGE") }).parse(d))
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("purge_runtime_error_logs", { _manual: true });
    if (error) throw new Error(error.message);
    return { deleted: (data as number) ?? 0 };
  });
