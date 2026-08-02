import { Suspense, useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { EmptyState, SectionCard, SectionCardSkeleton, StatusPill } from "@/components/primitives";
import { Pagination } from "@/components/table-controls";
import { Button } from "@/components/ui/button";
import {
  KYC_REMINDER_LABELS,
  listMyKycReminderEvents,
  type ReminderStatus,
} from "@/lib/kyc-reminders.functions";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "pending", label: "Pending" },
] as const;

const CHANNEL_TABS = [
  { key: "all", label: "All channels" },
  { key: "in_app", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]["key"];
type ChannelKey = (typeof CHANNEL_TABS)[number]["key"];

function pill(status: ReminderStatus) {
  if (status === "sent") return "cleared" as const;
  if (status === "failed") return "failed" as const;
  return "pending" as const;
}

export function KycReminderLog() {
  return (
    <SectionCard
      title="KYC reminder delivery log"
      accent="amber"
      action={
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldAlert className="size-3.5" /> Verification reminders
        </span>
      }
    >
      <Suspense fallback={<SectionCardSkeleton rows={5} />}>
        <LogBody />
      </Suspense>
    </SectionCard>
  );
}

function LogBody() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusKey>("all");
  const [channel, setChannel] = useState<ChannelKey>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["kyc-reminder-events", status, channel, page, pageSize],
      queryFn: () =>
        listMyKycReminderEvents({
          data: { status, channel, page, page_size: pageSize },
        }),
    }),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Reminder events" value={data.summary.total} />
        <Stat label="Sent" value={data.summary.sent} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Failed" value={data.summary.failed} tone="text-red-600 dark:text-red-400" />
        <Stat label="Pending" value={data.summary.pending} tone="text-amber-600 dark:text-amber-400" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <Chip
            key={t.key}
            active={status === t.key}
            onClick={() => {
              setStatus(t.key);
              setPage(1);
            }}
          >
            {t.label}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {CHANNEL_TABS.map((t) => (
          <Chip
            key={t.key}
            active={channel === t.key}
            onClick={() => {
              setChannel(t.key);
              setPage(1);
            }}
          >
            {t.label}
          </Chip>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => qc.invalidateQueries({ queryKey: ["kyc-reminder-events"] })}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          title="No KYC reminders yet"
          description="Deadline, final-notice and low-attempt reminders about your verification will appear here with their delivery status."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3">Reminder</th>
                <th className="py-2 pr-3">Channel</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3">
                    <span className="block font-medium">
                      {KYC_REMINDER_LABELS[r.category] ?? r.category}
                    </span>
                    <span className="block text-xs text-muted-foreground">{r.title}</span>
                    {r.error ? (
                      <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
                        {r.error}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-xs uppercase tracking-wide text-muted-foreground">
                    {r.channel === "in_app" ? "In-app" : r.channel}
                  </td>
                  <td className="py-2 pr-3">
                    <StatusPill status={pill(r.status)} />
                    {r.attempts > 1 ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {r.attempts} attempts
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={data.page}
        pageSize={data.page_size}
        total={data.total}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/60"
      }`}
    >
      {children}
    </button>
  );
}
