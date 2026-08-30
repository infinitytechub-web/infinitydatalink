import { cn } from "@/lib/utils";
import type { SupportMessage } from "@/lib/support.functions";

/** Chronological conversation view shared by the member and staff surfaces. */
export function SupportTicketThread({
  messages,
  emptyHint = "No replies yet.",
}: {
  messages: SupportMessage[];
  emptyHint?: string;
}) {
  if (messages.length === 0) {
    return <p className="p-5 text-xs text-muted-foreground">{emptyHint}</p>;
  }
  return (
    <ol className="space-y-3 p-5">
      {messages.map((m) => (
        <li
          key={m.id}
          className={cn(
            "rounded-lg border p-4 text-sm",
            m.is_internal
              ? "border-dashed border-amber-500/40 bg-amber-500/5"
              : m.is_staff
                ? "border-border bg-muted/40"
                : "border-border bg-card",
          )}
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="text-foreground">{m.author_label}</span>
            {m.author_role ? <span>· {m.author_role.replace(/_/g, " ")}</span> : null}
            {m.is_internal ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                Internal note
              </span>
            ) : null}
            <span className="ml-auto normal-case tracking-normal">
              {new Date(m.created_at).toLocaleString()}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}

const TONES: Record<string, string> = {
  open: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  awaiting_member: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
  urgent: "bg-red-500/15 text-red-700 dark:text-red-300",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
  breached: "bg-red-500/15 text-red-700 dark:text-red-300",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  met: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function TicketPill({ value, label }: { value: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        TONES[value] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label ?? value.replace(/_/g, " ")}
    </span>
  );
}
