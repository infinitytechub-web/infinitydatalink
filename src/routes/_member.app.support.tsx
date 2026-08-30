import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SupportTicketThread, TicketPill } from "@/components/support-ticket-thread";
import {
  createTicket,
  getMyTicket,
  listMyTickets,
  replyToTicket,
  setMyTicketState,
} from "@/lib/support.functions";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  type SupportCategory,
  type SupportPriority,
} from "@/lib/support.shared";

const FAQS: Array<[string, string]> = [
  [
    "How do I change my savings schedule?",
    "Open your savings account and update the contribution frequency or amount; changes take effect on the next scheduled run.",
  ],
  [
    "How long does a loan application take?",
    "Most complete applications receive a decision within 2–3 business days after KYC and required documents are verified.",
  ],
  [
    "How do I link a mobile money account?",
    "Go to Payments, choose Add method, select your mobile money provider, and confirm the one-time verification code.",
  ],
  [
    "How is interest calculated on my savings?",
    "Interest accrues daily on your cleared balance and is credited monthly based on your plan's published rate.",
  ],
];

type Search = { ticket?: string };

export const Route = createFileRoute("/_member/app/support")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ticket: typeof search.ticket === "string" ? search.ticket : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Help & Support — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Get help with your IT-360 CashApp account: raise a support ticket, track replies, and read answers to common savings, loans, and payments questions.",
      },
      { name: "robots", content: "noindex" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map(([q, a]) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }),
      },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { ticket } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  const listFn = useServerFn(listMyTickets);
  const tickets = useQuery({ queryKey: ["my-tickets"], queryFn: () => listFn() });

  const open = () => qc.invalidateQueries({ queryKey: ["my-tickets"] });

  return (
    <>
      <PageHeader
        eyebrow="Support centre"
        title="Help & Support"
        description="Raise a ticket, follow the conversation with our support team, and browse answers to common questions."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {ticket ? (
            <TicketDetail id={ticket} onBack={() => navigate({ search: {} })} onChanged={open} />
          ) : (
            <SectionCard title="My tickets">
              {tickets.isLoading ? (
                <p className="p-5 text-xs text-muted-foreground">Loading tickets…</p>
              ) : (tickets.data ?? []).length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="No tickets yet"
                    hint="Use the form to raise your first support ticket. You'll be notified as soon as an officer replies."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {(tickets.data ?? []).map((t) => (
                    <li key={t.id}>
                      <button
                        className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-muted/40"
                        onClick={() => navigate({ search: { ticket: t.id } })}
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">{t.ref}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {t.subject}
                        </span>
                        <TicketPill value={t.priority} label={PRIORITY_LABELS[t.priority]} />
                        <TicketPill value={t.status} />
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(t.created_at).toLocaleDateString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}

          <SectionCard title="Frequently asked questions">
            <div className="divide-y divide-border">
              {FAQS.map(([q, a]) => (
                <details key={q} className="group p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                    <span className="mr-2 text-brand-gold-ink dark:text-brand-gold">＋</span>
                    {q}
                  </summary>
                  <p className="mt-2 pl-6 text-sm text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <NewTicketForm
            onCreated={(id) => {
              open();
              navigate({ search: { ticket: id } });
            }}
          />
          <SectionCard title="Other ways to reach us" accent="gold">
            <div className="space-y-3 p-5 text-sm">
              <p className="text-muted-foreground">
                WhatsApp <span className="font-medium text-foreground">+233 55 000 0000</span>
              </p>
              <p className="text-muted-foreground">
                Phone lines are open Monday to Friday, 8:00–17:00 GMT.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function NewTicketForm({ onCreated }: { onCreated: (id: string) => void }) {
  const createFn = useServerFn(createTicket);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("other");
  const [priority, setPriority] = useState<SupportPriority>("normal");
  const [body, setBody] = useState("");

  const mutation = useMutation({
    mutationFn: () => createFn({ data: { subject, category, priority, body } }),
    onSuccess: (res) => {
      toast.success(`Ticket ${res.ref} created`);
      setSubject("");
      setBody("");
      onCreated(res.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = subject.trim().length >= 5 && body.trim().length >= 15;

  return (
    <SectionCard title="Raise a ticket">
      <div className="space-y-3 p-5">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Subject
          </label>
          <Input
            value={subject}
            maxLength={150}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Briefly describe the issue"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Category
            </label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportCategory)}
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Priority
            </label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as SupportPriority)}
            >
              {SUPPORT_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Details
          </label>
          <Textarea
            rows={5}
            value={body}
            maxLength={4000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tell us what happened, including any reference numbers (minimum 15 characters)."
          />
        </div>
        <Button
          className="w-full"
          disabled={!valid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Submitting…" : "Submit ticket"}
        </Button>
      </div>
    </SectionCard>
  );
}

function TicketDetail({
  id,
  onBack,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const getFn = useServerFn(getMyTicket);
  const replyFn = useServerFn(replyToTicket);
  const stateFn = useServerFn(setMyTicketState);
  const [reply, setReply] = useState("");

  const query = useQuery({
    queryKey: ["my-ticket", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: 30_000,
  });

  const replyMutation = useMutation({
    mutationFn: () => replyFn({ data: { id, body: reply } }),
    onSuccess: () => {
      setReply("");
      toast.success("Reply sent");
      void query.refetch();
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stateMutation = useMutation({
    mutationFn: (action: "close" | "reopen") => stateFn({ data: { id, action } }),
    onSuccess: () => {
      toast.success("Ticket updated");
      void query.refetch();
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) {
    return (
      <SectionCard title="Ticket">
        <p className="p-5 text-xs text-muted-foreground">Loading conversation…</p>
      </SectionCard>
    );
  }
  if (query.error || !query.data) {
    return (
      <SectionCard title="Ticket">
        <div className="p-5">
          <EmptyState title="Ticket unavailable" hint={(query.error as Error)?.message} />
          <Button variant="outline" className="mt-3" onClick={onBack}>
            Back to my tickets
          </Button>
        </div>
      </SectionCard>
    );
  }

  const t = query.data;
  const canReply = t.status !== "closed";

  return (
    <SectionCard
      title={`${t.ref} · ${t.subject}`}
      action={
        <Button variant="outline" size="sm" onClick={onBack}>
          All tickets
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3 text-[11px] text-muted-foreground">
        <TicketPill value={t.status} />
        <TicketPill value={t.priority} label={PRIORITY_LABELS[t.priority]} />
        <span>{CATEGORY_LABELS[t.category]}</span>
        <span className="ml-auto">Opened {new Date(t.created_at).toLocaleString()}</span>
      </div>

      {t.resolution_note ? (
        <p className="border-b border-border/60 bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Resolution: </span>
          {t.resolution_note}
        </p>
      ) : null}

      <SupportTicketThread messages={t.messages} />

      <div className="space-y-3 border-t border-border/60 p-5">
        {canReply ? (
          <>
            <Textarea
              rows={3}
              value={reply}
              maxLength={4000}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Add a reply for the support team…"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={reply.trim().length < 2 || replyMutation.isPending}
                onClick={() => replyMutation.mutate()}
              >
                {replyMutation.isPending ? "Sending…" : "Send reply"}
              </Button>
              <Button
                variant="outline"
                disabled={stateMutation.isPending}
                onClick={() => stateMutation.mutate("close")}
              >
                Close ticket
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="outline"
            disabled={stateMutation.isPending}
            onClick={() => stateMutation.mutate("reopen")}
          >
            Reopen ticket
          </Button>
        )}
      </div>
    </SectionCard>
  );
}
