import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { BellRing, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, SectionCardSkeleton, StatusPill, EmptyState } from "@/components/primitives";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  NOTIFICATION_CATEGORIES,
  getMyNotificationSettings,
  updateMyNotificationSettings,
  type NotificationPreferences,
} from "@/lib/notification-preferences.functions";

export const Route = createFileRoute("/_member/app/notifications")({
  head: () => ({
    meta: [
      { title: "Alert settings — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
});

const settingsQuery = queryOptions({
  queryKey: ["member", "notification-settings"],
  queryFn: () => getMyNotificationSettings(),
});

function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member portal"
        title="Alerts & notifications"
        description="Choose how you hear about loan decisions, disbursements, installments and savings activity."
      />
      <Suspense fallback={<SectionCardSkeleton rows={6} />}>
        <NotificationsContent />
      </Suspense>
    </div>
  );
}

function NotificationsContent() {
  const { data } = useSuspenseQuery(settingsQuery);
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<NotificationPreferences>(data.preferences);

  useEffect(() => {
    setPrefs(data.preferences);
  }, [data.preferences]);

  const save = useMutation({
    mutationFn: (next: NotificationPreferences) => updateMyNotificationSettings({ data: next }),
    onSuccess: () => {
      toast.success("Alert settings saved");
      qc.invalidateQueries({ queryKey: ["member", "notification-settings"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Could not save settings"),
  });

  const toggleCategory = (key: string, muted: boolean) => {
    setPrefs((p) => ({
      ...p,
      muted_categories: muted
        ? Array.from(new Set([...p.muted_categories, key]))
        : p.muted_categories.filter((c) => c !== key),
    }));
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Delivery channels">
        <div className="space-y-4">
          <ChannelRow
            icon={<BellRing className="h-4 w-4" />}
            label="In-app alerts"
            hint="Real-time alerts inside the portal."
            checked={prefs.in_app}
            onChange={(v) => setPrefs((p) => ({ ...p, in_app: v }))}
          />
          <ChannelRow
            icon={<Mail className="h-4 w-4" />}
            label="Email alerts"
            hint="Sent to the email address on your account."
            checked={prefs.email}
            onChange={(v) => setPrefs((p) => ({ ...p, email: v }))}
          />
          <ChannelRow
            icon={<MessageSquare className="h-4 w-4" />}
            label="SMS alerts"
            hint={data.hasPhone ? "Sent to the phone number on your profile." : "Add a phone number to your profile to receive SMS."}
            checked={prefs.sms}
            onChange={(v) => setPrefs((p) => ({ ...p, sms: v }))}
          />
          {prefs.sms && !data.hasPhone ? (
            <Alert>
              <AlertDescription className="text-xs">
                No phone number is saved on your profile, so SMS alerts will be skipped until you add one.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Event types">
        <div className="grid gap-3 sm:grid-cols-2">
          {NOTIFICATION_CATEGORIES.map((cat) => {
            const muted = prefs.muted_categories.includes(cat.key);
            return (
              <label
                key={cat.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span>{cat.label}</span>
                <Switch checked={!muted} onCheckedChange={(v) => toggleCategory(cat.key, !v)} />
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save.mutate(prefs)} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Recent deliveries">
        {data.deliveries.length === 0 ? (
          <EmptyState title="No deliveries yet" hint="Email and SMS alerts will appear here once events occur." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Alert</th>
                  <th className="py-2">Channel</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-border/60">
                    <td className="py-2">
                      <div className="font-medium">{d.title}</div>
                      <div className="text-xs text-muted-foreground">{d.category}</div>
                    </td>
                    <td className="py-2 uppercase text-xs">{d.channel}</td>
                    <td className="py-2">
                      <StatusPill status={d.status === "sent" ? "cleared" : d.status === "skipped" ? "rejected" : "pending"} />
                      {d.error ? <div className="mt-1 text-xs text-muted-foreground">{d.error}</div> : null}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {new Date(d.sent_at ?? d.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ChannelRow({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-primary">{icon}</span>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
