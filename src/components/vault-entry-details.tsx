/**
 * Vault entry details — what exactly will be restored.
 *
 * Shows the archived member/reviewer/archiver metadata plus a live preview of
 * every archived document (type, upload date, size, review status) using the
 * same viewer admins use in the KYC queue, so a restore can be verified first.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DocumentPreviewPanel } from "@/components/document-preview-panel";
import { getKycVaultEntry } from "@/lib/kyc-vault.functions";
import type { VaultEntry } from "@/lib/kyc-vault.shared";

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");
const fmtBytes = (n?: number | null) =>
  !n ? "—" : n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-xs">{value ?? "—"}</span>
    </div>
  );
}

export function VaultEntryDetailsDialog({
  entry,
  onClose,
  onRestore,
}: {
  entry: VaultEntry | null;
  onClose: () => void;
  onRestore: (entry: VaultEntry) => void;
}) {
  const detailFn = useServerFn(getKycVaultEntry);
  const { data, isFetching, error } = useQuery({
    queryKey: ["kyc-vault-entry", entry?.id],
    queryFn: () => detailFn({ data: { id: entry!.id } }),
    enabled: !!entry,
  });

  const review = data?.review;
  const docs = data?.entry.documents ?? [];

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {entry?.member_name ?? "Archived KYC record"}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {entry?.member_no ?? entry?.member_id}
            </span>
          </DialogTitle>
          <DialogDescription>
            Everything captured when this review was archived. Verify the documents and reviewer
            context before restoring.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {(error as any)?.message ?? "Unable to load this vault entry."}
          </p>
        ) : null}

        {data?.restorable === false ? (
          <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Not restorable:</strong> {data.restore_blocker}
            </span>
          </div>
        ) : data?.restorable ? (
          <div className="flex items-center gap-2 rounded border border-emerald-mid/40 bg-emerald-mid/10 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" /> Validated — this record can be restored to “
            {review?.previous_kyc ?? "—"}”.
          </div>
        ) : null}

        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-3">
          <Row label="Previous status" value={(review?.previous_kyc ?? "—").toUpperCase()} />
          <Row label="Documents archived" value={`${docs.length}`} />
          <Row label="Purges after" value={fmtDate(entry?.purge_after)} />
          <Row
            label="Archived by"
            value={
              <>
                {entry?.deleted_by_email ?? "—"}
                {entry?.deleted_by_role ? ` (${entry.deleted_by_role})` : ""}
                <br />
                <span className="text-muted-foreground">{fmtDate(entry?.deleted_at)}</span>
              </>
            }
          />
          <Row
            label="Last reviewer"
            value={
              <>
                {review?.reviewed_by?.full_name ?? "—"}
                <br />
                <span className="text-muted-foreground">{fmtDate(review?.reviewed_at)}</span>
              </>
            }
          />
          <Row
            label="Assigned officer"
            value={
              <>
                {review?.assigned_to?.full_name ?? "—"}
                <br />
                <span className="text-muted-foreground">{fmtDate(review?.assigned_at)}</span>
              </>
            }
          />
          <Row label="Submitted" value={fmtDate(review?.submitted_at)} />
          <Row label="Resubmitted" value={fmtDate(review?.resubmitted_at)} />
          <Row
            label="Attempts / risk"
            value={`${review?.attempts ?? 0} · ${review?.risk_level ?? "n/a"}`}
          />
          <Row label="Archive reason" value={entry?.reason ?? "—"} />
          <Row label="Reviewer note" value={review?.kyc_notes ?? "—"} />
          <Row
            label="Outstanding items"
            value={review?.remediation_items?.length ? review.remediation_items.join(", ") : "None"}
          />
        </div>

        <div className="overflow-x-auto rounded border border-border/60">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Document type</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Review status</th>
                <th className="px-3 py-2">Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    {isFetching ? "Loading…" : "No documents were archived with this record."}
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id} className="border-t border-border/40">
                    <td className="px-3 py-2 font-medium">{d.doc_type.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(d.created_at)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtBytes(d.size_bytes)}</td>
                    <td className="px-3 py-2 uppercase tracking-wide">{d.status ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(d.reviewed_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {docs.length > 0 ? (
          <DocumentPreviewPanel
            documents={docs.map((d) => ({
              id: d.id,
              doc_type: d.doc_type,
              mime_type: d.mime_type,
              size_bytes: d.size_bytes,
              status: d.status ?? null,
              review_notes: d.review_notes ?? null,
              created_at: d.created_at,
              signed_url: (d as any).signed_url ?? null,
            }))}
          />
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={!entry || data?.restorable === false || isFetching}
            onClick={() => entry && onRestore(entry)}
          >
            Restore this record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
