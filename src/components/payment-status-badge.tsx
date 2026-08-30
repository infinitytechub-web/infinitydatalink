import { STATUS_LABELS, type IntentStatus } from "@/lib/payment-rails";

const TONE: Record<string, string> = {
  requires_configuration: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  pending: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  processing: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  succeeded: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  reversed: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
        (TONE[status] ?? "bg-muted text-muted-foreground")
      }
    >
      {STATUS_LABELS[status as IntentStatus] ?? status}
    </span>
  );
}
