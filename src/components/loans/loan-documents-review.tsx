import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Eye } from "lucide-react";
import { EmptyState, SectionCard, StatusPill } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { humanBytes, isPreviewable } from "@/lib/files.shared";
import { adminReviewFile, signFileUrl } from "@/lib/files.functions";
import { adminListLoanDocuments } from "@/lib/loan-documents.functions";

/** Officer panel on the loan detail page: view and approve/reject loan documents. */
export function LoanDocumentsReview({ loanId }: { loanId: string }) {
  const list = useServerFn(adminListLoanDocuments);
  const review = useServerFn(adminReviewFile);
  const sign = useServerFn(signFileUrl);
  const qc = useQueryClient();
  const key = ["admin", "loan-documents", loanId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { loan_id: loanId } }) });
  const [notes, setNotes] = useState<Record<string, string>>({});

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" }) =>
      review({ data: { id: v.id, decision: v.decision, note: (notes[v.id] ?? "").trim() } }),
    onSuccess: (_r, v) => {
      toast.success(v.decision === "approved" ? "Document approved" : "Document rejected");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function open(id: string, purpose: "preview" | "download") {
    try {
      const res = await sign({ data: { id, purpose } });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <SectionCard title="Loan documents">
      {q.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading documents…</div>
      ) : q.error ? (
        <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>
      ) : !q.data || q.data.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No documents" hint="The member hasn't uploaded documents for this loan." />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {q.data.map((d) => {
            const note = notes[d.id] ?? "";
            const noteOk = note.trim().length >= 10;
            return (
              <li key={d.id} className="space-y-3 px-6 py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {humanBytes(d.size_bytes)} · uploaded {new Date(d.created_at).toLocaleString()}
                    </div>
                    {d.review_note && d.review_status !== "pending" && (
                      <div className="mt-1 text-xs text-muted-foreground">Note: {d.review_note}</div>
                    )}
                  </div>
                  <StatusPill status={d.review_status} />
                  {isPreviewable(d.mime_type) && (
                    <Button size="sm" variant="ghost" aria-label={`View ${d.filename}`} onClick={() => void open(d.id, "preview")}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" aria-label={`Download ${d.filename}`} onClick={() => void open(d.id, "download")}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                {d.review_status === "pending" && (
                  <div className="flex flex-col gap-2 md:flex-row md:items-start">
                    <Textarea
                      value={note}
                      onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                      placeholder="Review note for the member (at least 10 characters)"
                      aria-label={`Review note for ${d.filename}`}
                      className="min-h-16 flex-1"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!noteOk || decide.isPending} onClick={() => decide.mutate({ id: d.id, decision: "approved" })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" disabled={!noteOk || decide.isPending} onClick={() => decide.mutate({ id: d.id, decision: "rejected" })}>
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
