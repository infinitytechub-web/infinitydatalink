// Early settlement / payoff quote for a loan.
// Read-only and advisory: computes principal, interest due, accrued interest to
// the settlement date, outstanding penalties, and the rebate of future interest.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computePayoffQuote } from "@/lib/loan-payoff-core";
import type { PayoffLine, PayoffQuote } from "@/lib/loan-payoff-core";

export type { PayoffLine, PayoffQuote };

export const getLoanPayoffQuote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        loan_id: z.string().uuid(),
        settle_on: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD settlement date")
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PayoffQuote> => {
    const { user_id: _ignored, ...quote } = await computePayoffQuote(context.supabase, data);
    return quote;
  });
