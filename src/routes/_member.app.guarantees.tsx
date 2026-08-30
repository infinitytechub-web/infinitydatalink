import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/org-config";
import {
  listMyGuarantees,
  respondToGuarantee,
  type MyGuaranteeRow,
} from "@/lib/loan-security.functions";

export const Route = createFileRoute("/_member/app/guarantees")({
  head: () => ({
    meta: [
      { title: "My Guarantees — Member Portal" },
      {
        name: "description",
        content:
          "Review loans you have been asked to guarantee, accept or decline consent, and track your exposure.",
      },
      { property: "og:title", content: "My Guarantees" },
      {
        property: "og:description",
        content: "Accept or decline guarantee requests and track your guaranteed exposure.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuaranteesPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function PageError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="p-6">
      <ErrorState
        title="Guarantees failed to load"
        message={error.message}
        onRetry={() => router.invalidate()}
      />
    </div>
  );
}

const guaranteesQuery = queryOptions({
  queryKey: ["member", "guarantees"],
  queryFn: () => listMyGuarantees(),
});

function GuaranteesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="My guarantees"
        description="Loans where you have been named as a guarantor. Your consent is required before the loan can be approved."
      />
      <Suspense fallback={<SectionCardSkeleton title="Guarantee requests" rows={4} cols={5} />}>
        <GuaranteesContent />
      </Suspense>
    </>
  );
}

function GuaranteesContent() {
  const { data: rows } = useSuspenseQuery(guaranteesQuery);
  const [responding, setResponding] = useState<{ row: MyGuaranteeRow; accept: boolean } | null>(
    null,
  );

  const pending = rows.filter((r) => r.consent === "pending");
  const exposure = rows
    .filter(
      (r) =>
        r.consent === "accepted" && (r.loan_status === "active" || r.loan_status === "approved"),
    )
    .reduce((sum, r) => sum + r.guaranteed_amount, 0);

  return (
    <div className="space-y-6">
      <SectionCard title={`Guarantee requests (${pending.length} awaiting your response)`}>
        {rows.length === 0 ? (
          <EmptyState
            title="No guarantee requests"
            hint="If another member names you as a guarantor, the request will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Loan</th>
                  <th className="py-2 pr-4">Borrower</th>
                  <th className="py-2 pr-4">Guaranteed</th>
                  <th className="py-2 pr-4">Consent</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 align-top">
                    <td className="py-3 pr-4">
                      <div className="font-mono text-xs">{r.loan_ref ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.loan_amount != null ? formatMoney(r.loan_amount) : ""}{" "}
                        {r.loan_status ?? ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div>{r.borrower_name ?? "—"}</div>
                      {r.relationship && (
                        <div className="text-xs text-muted-foreground">{r.relationship}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4">{formatMoney(r.guaranteed_amount)}</td>
                    <td className="py-3 pr-4">
                      <StatusPill
                        status={
                          r.consent === "accepted"
                            ? "approved"
                            : r.consent === "declined"
                              ? "rejected"
                              : "pending"
                        }
                      />
                      {r.consent_at && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {new Date(r.consent_at).toLocaleDateString()}
                        </div>
                      )}
                      {r.consent_note && (
                        <div className="text-xs text-muted-foreground">“{r.consent_note}”</div>
                      )}
                    </td>
                    <td className="py-3">
                      {r.consent === "pending" ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => setResponding({ row: r, accept: true })}>
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setResponding({ row: r, accept: false })}
                          >
                            Decline
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Responded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Your exposure">
        <p className="text-sm text-muted-foreground">
          You are currently guaranteeing{" "}
          <span className="font-semibold text-foreground">{formatMoney(exposure)}</span> across live
          loans. Accepting a guarantee means the institution may recover the guaranteed amount from
          you if the borrower defaults.
        </p>
      </SectionCard>

      <RespondDialog pending={responding} onClose={() => setResponding(null)} />
    </div>
  );
}

function RespondDialog({
  pending,
  onClose,
}: {
  pending: { row: MyGuaranteeRow; accept: boolean } | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const respond = useServerFn(respondToGuarantee);
  const mutation = useMutation({
    mutationFn: () =>
      respond({
        data: {
          guarantor_id: pending!.row.id,
          decision: pending!.accept ? "accepted" : "declined",
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(pending?.accept ? "Guarantee accepted" : "Guarantee declined");
      qc.invalidateQueries({ queryKey: ["member", "guarantees"] });
      setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error("Response failed", { description: e.message }),
  });

  return (
    <Dialog open={pending !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.accept ? "Accept guarantee" : "Decline guarantee"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {pending && (
            <p className="text-muted-foreground">
              {pending.row.loan_ref ?? "Loan"} · {pending.row.borrower_name ?? "member"} ·{" "}
              {formatMoney(pending.row.guaranteed_amount)}
              {pending.accept
                ? " — by accepting, you agree to cover this amount if the borrower defaults."
                : " — the loan officer will be notified that you declined."}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : pending?.accept ? "Accept guarantee" : "Decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
