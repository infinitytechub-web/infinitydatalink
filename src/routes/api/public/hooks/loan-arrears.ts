// Nightly arrears + penalty accrual job.
//
// Safety model:
//  * Idempotency — every invocation claims a (job, run_key) slot via
//    `claim_cron_run`. Default run_key is the UTC date, so retrying the same
//    night short-circuits and replays the stored metrics instead of accruing
//    late fees a second time. `assess_loan_penalties` is additionally guarded
//    at the row level by a unique (repayment_id, period_month) constraint.
//  * Observability — start/finish, duration, attempt number, metrics and any
//    error are persisted to `cron_job_runs` and logged to stdout so failures
//    are visible in worker logs and in the admin health page.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const JOB = "loan-arrears";

const BodySchema = z
  .object({
    run_key: z.string().trim().min(4).max(64).optional(),
  })
  .default({});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/loan-arrears")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCronRequest } = await import("@/lib/cron-auth.server");
        const denied = authorizeCronRequest(request);
        if (denied) return denied;

        let parsed: z.infer<typeof BodySchema>;
        try {
          const raw = await request.text();
          parsed = BodySchema.parse(raw ? JSON.parse(raw) : {});
        } catch {
          return json({ success: false, error: "invalid body" }, 400);
        }

        const runKey = parsed.run_key ?? new Date().toISOString().slice(0, 10);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        // Single implementation lives in the DB routine `run_loan_arrears_job`,
        // which owns the run-ledger claim, the arrears refresh, penalty accrual
        // and the finish/metrics write in one transaction-scoped unit. pg_cron
        // calls the same routine nightly; this endpoint is the manual re-run.
        const startedAt = Date.now();
        console.log(`[cron:${JOB}] invoking run_loan_arrears_job run_key=${runKey}`);

        const { data, error } = await admin.rpc("run_loan_arrears_job", {
          _run_key: runKey,
          _caller: (request.headers.get("user-agent") ?? "http").slice(0, 200),
        });

        const elapsed = Date.now() - startedAt;
        if (error) {
          // The routine records the failure in cron_job_runs before re-raising,
          // so the ledger stays accurate and the same run_key can be retried.
          console.error(`[cron:${JOB}] run ${runKey} FAILED after ${elapsed}ms:`, error.message);
          return json({ success: false, run_key: runKey, duration_ms: elapsed, error: error.message }, 500);
        }

        const result: any = data ?? {};
        if (result.skipped) {
          console.log(`[cron:${JOB}] run ${runKey} already succeeded — replaying metrics, no fees re-posted.`);
        } else {
          const m = result.metrics ?? {};
          console.log(
            `[cron:${JOB}] run ${runKey} succeeded in ${elapsed}ms (attempt ${result.attempt}) — ` +
              `${m.loans_updated ?? 0} loans updated, ${m.penalties_created ?? 0} penalties totalling ${m.penalty_total ?? 0}.`,
          );
        }
        return json({ ...result, duration_ms: result.duration_ms ?? elapsed });
      },
    },
  },
});
