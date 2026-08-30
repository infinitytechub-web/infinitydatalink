import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/primitives";
import { formatMoney } from "@/lib/org-config";
import { getMyRecordDetail, type RecordDetail } from "@/lib/member-record-details.functions";
import type { MemberReportDataset } from "@/lib/member-reports.shared";

/**
 * Deep-linkable details panel for a single record behind a report row.
 * The open record lives in the URL, so the panel survives refresh and sharing.
 */
export function ReportRecordDetails({
  dataset,
  recordId,
  onClose,
}: {
  dataset: MemberReportDataset;
  recordId: string;
  onClose: () => void;
}) {
  const fetchDetail = useServerFn(getMyRecordDetail);
  const query = useQuery({
    queryKey: ["member", "record-detail", dataset, recordId],
    queryFn: () => fetchDetail({ data: { dataset, record_id: recordId } }),
    staleTime: 15_000,
  });
  const detail = query.data as RecordDetail | undefined;

  const copyJson = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(detail.raw, null, 2));
      toast.success("Record JSON copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail?.title ?? "Record details"}</DialogTitle>
          <DialogDescription>
            {detail?.subtitle ?? "Full details for the selected statement row."}
          </DialogDescription>
        </DialogHeader>

        {query.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">{(query.error as Error).message}</p>
        ) : detail ? (
          <div className="space-y-5">
            {detail.status ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Status
                </span>
                <StatusPill status={detail.status as never} />
              </div>
            ) : null}

            <dl className="grid gap-3 sm:grid-cols-2">
              {detail.fields.map((f) => (
                <div key={f.label} className="rounded border border-emerald-deep/10 bg-card p-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {f.label}
                  </dt>
                  <dd className="mt-1 break-words text-sm font-medium text-foreground">
                    {f.money ? formatMoney(Number(f.value)) : f.value}
                  </dd>
                </div>
              ))}
            </dl>

            {detail.timeline.some((t) => t.at) ? (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Timeline
                </h4>
                <ol className="mt-2 space-y-2">
                  {detail.timeline
                    .filter((t) => t.at)
                    .map((t) => (
                      <li key={t.label} className="flex items-start gap-3 text-sm">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        <span>
                          <span className="font-medium">{t.label}</span>{" "}
                          <span className="text-muted-foreground">
                            {new Date(t.at as string).toLocaleString()}
                          </span>
                          {t.note ? (
                            <span className="block text-xs text-muted-foreground">{t.note}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                </ol>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-emerald-deep/10 pt-4">
              <Button size="sm" variant="outline" className="gap-1" onClick={() => void copyJson()}>
                <Copy className="h-3.5 w-3.5" /> Copy JSON
              </Button>
              {detail.link ? (
                <Button asChild size="sm" variant="outline" className="gap-1">
                  <a href={detail.link}>
                    <ExternalLink className="h-3.5 w-3.5" /> Open full page
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
