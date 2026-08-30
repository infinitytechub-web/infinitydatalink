import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MemberReconResult } from "@/lib/member-reconciliation.shared";

export const runMyReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date_from: z.string(),
        date_to: z.string(),
        stale_days: z.number().int().min(1).max(60).optional().default(3),
        tolerance: z.number().min(0).max(100).optional().default(0.01),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<MemberReconResult> => {
    const { buildMemberReconciliation } = await import("@/lib/member-reconciliation.server");
    return buildMemberReconciliation(context.supabase, context.userId, {
      date_from: data.date_from,
      date_to: data.date_to,
      stale_days: data.stale_days,
      tolerance: data.tolerance,
    });
  });
