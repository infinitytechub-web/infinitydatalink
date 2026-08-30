import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit-log";

/**
 * Audit trail for analytics dashboard downloads. The download itself is
 * rendered in the browser from data the caller already fetched; this records
 * who exported which period/scope in which format.
 */
export const logAnalyticsExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        format: z.enum(["csv", "pdf"]),
        rows: z.number().int().min(0),
        sections: z.number().int().min(0),
        date_from: z.string().max(20),
        date_to: z.string().max(20),
        granularity: z.enum(["day", "week", "month"]),
        entity: z.string().max(60).default("all"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPermission(context.supabase, context.userId, "reports", "export");
    await writeAudit({
      actor_id: context.userId,
      action: "report.export.analytics_dashboard",
      target: "analytics_dashboard",
      meta: {
        format: data.format,
        rows: data.rows,
        sections: data.sections,
        date_from: data.date_from,
        date_to: data.date_to,
        granularity: data.granularity,
        entity: data.entity,
      },
    });
    return { ok: true };
  });
