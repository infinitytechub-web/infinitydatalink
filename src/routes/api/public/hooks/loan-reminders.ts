import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/loan-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCronRequest } = await import("@/lib/cron-auth.server");
        const denied = authorizeCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { reminderStage, isOverdueStage } = await import("@/lib/loan-reminder-stage");
        const { queueRepaymentReminderEmail } = await import("@/lib/email/send-repayment-reminder.server");
        const admin: any = supabaseAdmin;

        const today = new Date().toISOString().slice(0, 10);
        const horizon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
        const { data: rows, error } = await admin
          .from("loan_repayments")
          .select("id, installment_no, due_date, total_due, paid_amount, status, loans!inner(id, ref, user_id, status)")
          .neq("status", "paid")
          .lte("due_date", horizon)
          .eq("loans.status", "active")
          .limit(2000);
        if (error) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }

        let sent = 0;
        let emailed = 0;
        const profileCache = new Map<string, { name: string | null; email: string | null }>();
        for (const r of rows ?? []) {
          const remaining = Math.round((Number(r.total_due) - Number(r.paid_amount ?? 0)) * 100) / 100;
          if (remaining <= 0) continue;
          const stage = reminderStage(r.due_date, today);
          if (!stage) continue;
          const loan = r.loans;

          // Claim the (installment, stage) slot; a conflict means it was already sent.
          const { data: claimed, error: claimErr } = await admin
            .from("loan_reminder_log")
            .upsert(
              { repayment_id: r.id, user_id: loan.user_id, stage },
              { onConflict: "repayment_id,stage", ignoreDuplicates: true },
            )
            .select("id");
          if (claimErr || !claimed || claimed.length === 0) continue;

          const overdue = isOverdueStage(stage);
          const dueLabel = new Date(`${r.due_date}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
          });
          await admin.rpc("notify_user", {
            _user_id: loan.user_id,
            _category: overdue ? "loan.installment.overdue" : "loan.installment.due",
            _title: overdue ? "Installment overdue" : `Installment due ${dueLabel}`,
            _body: `Installment #${r.installment_no} of GH₵ ${remaining.toFixed(2)} on loan ${loan.ref} ${overdue ? `was due on ${dueLabel} and is overdue` : `is due on ${dueLabel}`}.`,
            _link: "/app/repayments",
            _meta: { loan_id: loan.id, repayment_id: r.id, due_date: r.due_date, stage },
            _dedupe_key: `inst-${stage}:${r.id}`,
          });
          sent++;

          let prof = profileCache.get(loan.user_id);
          if (!prof) {
            const [{ data: p }, { data: u }] = await Promise.all([
              admin.from("profiles").select("full_name").eq("id", loan.user_id).maybeSingle(),
              admin.auth.admin.getUserById(loan.user_id),
            ]);
            prof = { name: p?.full_name ?? null, email: u?.user?.email ?? null };
            profileCache.set(loan.user_id, prof);
          }
          let status = "skipped";
          if (prof.email) {
            status = await queueRepaymentReminderEmail(admin, {
              to: prof.email,
              memberName: prof.name,
              loanRef: loan.ref,
              installmentNo: r.installment_no,
              amount: remaining,
              dueDate: r.due_date,
              overdue,
              messageId: `repay-${stage}-${r.id}`,
            });
            if (status === "queued") emailed++;
          }
          await admin.from("loan_reminder_log").update({ email_status: status }).eq("id", claimed[0].id);
        }

        return Response.json({ success: true, notified: sent, emailed });
      },
    },
  },
});
