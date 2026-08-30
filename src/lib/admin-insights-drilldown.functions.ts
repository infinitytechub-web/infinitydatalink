import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminRole, resolveScopeUserIds } from "@/lib/admin-insights.server";
import {
  DRILLDOWN_METRICS,
  fetchDrilldown,
  type DrilldownResult,
} from "@/lib/admin-insights-drilldown.server";

export type {
  DrilldownMetric,
  DrilldownRow,
  DrilldownResult,
} from "@/lib/admin-insights-drilldown.server";

const InputSchema = z.object({
  metric: z.enum(DRILLDOWN_METRICS),
  from: z.string(),
  to: z.string(),
  entity: z.string().default("all"),
});

/** Returns the underlying records behind an analytics KPI or chart bucket. */
export const getInsightDrilldown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<DrilldownResult> => {
    await assertAdminRole(context.supabase, context.userId);
    const scopeIds = await resolveScopeUserIds(context.supabase, data.entity);
    const fromDate = new Date(`${data.from}T00:00:00Z`);
    const toDate = new Date(`${data.to}T00:00:00Z`);
    return fetchDrilldown(context.supabase, {
      metric: data.metric,
      fromISO: fromDate.toISOString(),
      toISO: new Date(toDate.getTime() + 24 * 3600 * 1000 - 1).toISOString(),
      fromDate: data.from,
      toDate: data.to,
      scopeIds,
    });
  });
