/**
 * Normalised approval / rejection audit trail.
 *
 * Every staff decision (approve, reject, pay, activate, deactivate, clear…)
 * funnels through `recordDecision` so the compliance trail has one consistent
 * shape: who decided, when, on what, with which note.
 *
 * Rows are still written to `public.audit_log` via the trusted service-role
 * helper — this module only standardises `action` and `meta`.
 */
import { writeAudit } from "@/lib/audit-log";

export const DECISION_MODULES = [
  "loan",
  "withdrawal",
  "kyc",
  "user",
  "expense",
  "transfer",
  "entity",
  "dividend",
  "settings",
] as const;
export type DecisionModule = (typeof DECISION_MODULES)[number];

export const DECISION_OUTCOMES = [
  "approved",
  "rejected",
  "paid",
  "cleared",
  "activated",
  "deactivated",
] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

/** `loan.approved`, `withdrawal.rejected`, … — the audit_log.action convention. */
export function decisionAction(module: DecisionModule, outcome: DecisionOutcome) {
  return `${module}.${outcome}`;
}

export function isDecisionAction(action: string) {
  const [mod, out] = action.split(".");
  return (
    (DECISION_MODULES as readonly string[]).includes(mod ?? "") &&
    (DECISION_OUTCOMES as readonly string[]).includes(out ?? "")
  );
}

export const DECISION_ACTIONS: string[] = DECISION_MODULES.flatMap((m) =>
  DECISION_OUTCOMES.map((o) => `${m}.${o}`),
);

export type DecisionInput = {
  actorId: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  module: DecisionModule;
  outcome: DecisionOutcome;
  /** Primary record the decision applies to (loan id, request id, user id…). */
  target: string;
  /** Compliance note / reason supplied by the officer. */
  note?: string | null;
  /** The member the record belongs to, when different from the actor. */
  subjectId?: string | null;
  /** Human-friendly reference (ref code, member no, name…). */
  reference?: string | null;
  amount?: number | null;
  meta?: Record<string, unknown>;
};

export async function recordDecision(input: DecisionInput): Promise<void> {
  await writeAudit({
    actor_id: input.actorId,
    actor_email: input.actorEmail ?? null,
    actor_role: input.actorRole ?? null,
    action: decisionAction(input.module, input.outcome),
    target: input.target,
    meta: {
      ...(input.meta ?? {}),
      module: input.module,
      decision: input.outcome,
      note: input.note ?? null,
      subject_id: input.subjectId ?? null,
      reference: input.reference ?? null,
      amount: input.amount ?? null,
      decided_at: new Date().toISOString(),
    },
  });
}
