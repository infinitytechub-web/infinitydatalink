import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { EmptyState, Money, PageHeader, SectionCard } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyAccountOverview } from "@/lib/member-account.functions";

export const Route = createFileRoute("/_member/app/account")({
  head: () => ({
    meta: [
      { title: "My account — IT-360 CashApp" },
      { name: "description", content: "Your profile, sign-in history and recent account activity." },
      { property: "og:title", content: "My account — IT-360 CashApp" },
      { property: "og:description", content: "Your profile, sign-in history and recent account activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Account unavailable: {(error as Error).message}</div>
  ),
});

const accountQuery = queryOptions({
  queryKey: ["member", "account-overview"],
  queryFn: () => getMyAccountOverview(),
  staleTime: 15_000,
});

function AccountPage() {
  return (
    <>
      <PageHeader eyebrow="Account" title="My account" description="Your profile, sign-in history and activity. Only you can see this page." />
      <Suspense fallback={<div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>}>
        <AccountBody />
      </Suspense>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value || "—"}</div>
    </div>
  );
}

function AccountBody() {
  const { data } = useSuspenseQuery(accountQuery);
  const p = data.profile;
  return (
    <div className="space-y-6">
      <SectionCard
        title="Profile"
        action={
          <Link to="/app/profile" className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/50">
            Edit profile
          </Link>
        }
      >
        <div className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={p.full_name} />
          <Field label="Member number" value={p.member_no} />
          <Field label="Email" value={p.email} />
          <Field label="Phone" value={p.phone} />
          <Field label="Verification" value={p.kyc} />
          <Field label="Member since" value={p.joined_at ? new Date(p.joined_at).toLocaleDateString() : null} />
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Sign-in history">
          {data.logins.length === 0 ? (
            <div className="p-6"><EmptyState title="No sign-ins recorded yet" hint="Your next sign-in will appear here." /></div>
          ) : (
            <ul className="divide-y divide-border">
              {data.logins.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-6 py-3 text-sm">
                  <div>
                    <div className="font-medium">{l.device}</div>
                    <div className="text-[11px] capitalize text-muted-foreground">{l.method ?? "email"} sign-in</div>
                  </div>
                  <div className="tabular text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent activity">
          {data.activity.length === 0 ? (
            <div className="p-6"><EmptyState title="No activity yet" hint="Payments and account updates appear here." /></div>
          ) : (
            <ul className="divide-y divide-border">
              {data.activity.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 px-6 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{a.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {a.detail}
                      {a.status ? ` · ${a.status}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {a.amount != null ? <Money amount={a.amount} /> : null}
                    <div className="tabular text-[11px] text-muted-foreground">{new Date(a.at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
