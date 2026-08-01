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

        // 1. Claim the run slot (idempotency gate).
        const { data: claimed, error: claimError } = await admin.rpc("claim_cron_run", {
          _job: JOB,
          _run_key: runKey,
          _caller: request.headers.get("user-agent")?.slice(0, 200) ?? null,
        });
        if (claimError) {
          console.error(`[cron:${JOB}] could not claim run ${runKey}:`, claimError.message);
          return json({ success: false, error: claimError.message }, 500);
        }
        const run: any = Array.isArray(claimed) ? claimed[0] : claimed;

        if (run?.status === "succeeded") {
          console.log(`[cron:${JOB}] run ${runKey} already succeeded — replaying metrics (no re-post).`);
          return json({
            success: true,
            skipped: true,
            reason: "already_completed",
            run_key: runKey,
            attempt: run.attempt,
            metrics: run.metrics ?? {},
          });
        }
        const startedAt = Date.now();
        console.log(`[cron:${JOB}] starting run ${runKey} (attempt ${run?.attempt ?? 1})`);

        try {
          // 2. Refresh arrears/DPD buckets, then accrue penalties.
          const { data: arrears, error: arrearsError } = await admin.rpc("refresh_loan_arrears");
          if (arrearsError) throw new Error(`refresh_loan_arrears: ${arrearsError.message}`);

          const { data: penalties, error: penaltyError } = await admin.rpc("assess_loan_penalties");
          if (penaltyError) throw new Error(`assess_loan_penalties: ${penaltyError.message}`);

          const a: any = Array.isArray(arrears) ? arrears[0] : arrears;
          const p: any = Array.isArray(penalties) ? penalties[0] : penalties;

          const metrics = {
            loans_updated: Number(a?.loans_updated ?? 0),
            as_of: a?.as_of ?? null,
            penalties_created: Number(p?.penalties_created ?? 0),
            penalty_total: Number(p?.total_amount ?? 0),
            period: p?.period ?? null,
            duration_ms: Date.now() - startedAt,
            attempt: Number(run?.attempt ?? 1),
          };

          const { error: finishError } = await admin.rpc("finish_cron_run", {
            _run_id: run.id,
            _status: "succeeded",
            _metrics: metrics,
            _error: null,
          });
          if (finishError) {
            console.error(`[cron:${JOB}] run ${runKey} finished but ledger update failed:`, finishError.message);
          }

          console.log(
            `[cron:${JOB}] run ${runKey} succeeded in ${metrics.duration_ms}ms — ` +
              `${metrics.loans_updated} loans updated, ${metrics.penalties_created} penalties (${metrics.penalty_total}).`,
          );
          return json({ success: true, run_key: runKey, ...metrics });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[cron:${JOB}] run ${runKey} FAILED after ${Date.now() - startedAt}ms:`, message);
          await admin
            .rpc("finish_cron_run", {
              _run_id: run.id,
              _status: "failed",
              _metrics: { duration_ms: Date.now() - startedAt, attempt: Number(run?.attempt ?? 1) },
              _error: message.slice(0, 1000),
            })
            .catch(() => undefined);
          // 500 lets the scheduler (or an operator) retry with the same run_key;
          // the ledger + unique penalty constraint make that safe.
          return json({ success: false, run_key: runKey, error: message }, 500);
        }
      },
    },
  },
});
