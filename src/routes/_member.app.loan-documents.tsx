import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useRef, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Eye, Trash2, UploadCloud } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCEPT_ATTRIBUTE,
  FILE_BUCKET,
  buildStoragePath,
  humanBytes,
  isPreviewable,
  validateUpload,
} from "@/lib/files.shared";
import { deleteMyFile, signFileUrl } from "@/lib/files.functions";
import { listMyLoanDocuments, registerMyLoanDocument } from "@/lib/loan-documents.functions";

const docsQuery = queryOptions({
  queryKey: ["member", "loan-documents"],
  queryFn: () => listMyLoanDocuments(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_member/app/loan-documents")({
  head: () => ({
    meta: [
      { title: "Loan documents — IT-360 CashApp" },
      {
        name: "description",
        content: "Upload, view and download the documents for your loans and track officer review.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <ErrorState title="Loan documents unavailable" message={(error as Error).message} />
  ),
  component: LoanDocumentsPage,
});

function LoanDocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Borrow"
        title="Loan documents"
        description="Upload supporting documents for each loan. A loan officer reviews every document; you'll be notified of the decision."
      />
      <Suspense fallback={<SectionCardSkeleton />}>
        <Workspace />
      </Suspense>
    </div>
  );
}

function Workspace() {
  const { data } = useSuspenseQuery(docsQuery);
  const qc = useQueryClient();
  const register = useServerFn(registerMyLoanDocument);
  const remove = useServerFn(deleteMyFile);
  const sign = useServerFn(signFileUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [loanId, setLoanId] = useState<string>(data.loans[0]?.id ?? "");
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["member", "loan-documents"] });

  async function upload(list: FileList | null) {
    if (!list || list.length === 0 || !loanId) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      toast.error("Your session expired — please sign in again.");
      setBusy(false);
      return;
    }
    for (const file of Array.from(list)) {
      const v = validateUpload({ filename: file.name, mime: file.type, size: file.size });
      if (!v.ok) {
        toast.error(`${file.name}: ${v.reasons.join(", ").replaceAll("_", " ")}`);
        continue;
      }
      const path = buildStoragePath(uid, file.name);
      const { error: upErr } = await supabase.storage
        .from(FILE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        toast.error(`${file.name}: ${upErr.message}`);
        continue;
      }
      try {
        await register({
          data: {
            loan_id: loanId,
            storage_path: path,
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          },
        });
        toast.success(`${file.name} uploaded`);
      } catch (err) {
        await supabase.storage.from(FILE_BUCKET).remove([path]);
        toast.error((err as Error).message);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    setBusy(false);
    void invalidate();
  }

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed");
      void invalidate();
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

  if (data.loans.length === 0) {
    return (
      <SectionCard title="Upload documents">
        <div className="p-6">
          <EmptyState
            title="No loans yet"
            hint="Apply for a loan first, then upload its supporting documents here."
          />
        </div>
      </SectionCard>
    );
  }

  const loanRef = new Map(data.loans.map((l) => [l.id, `${l.ref} · ${l.product}`]));
  const rows = data.documents.filter((d) => filter === "all" || d.loan_id === filter);
  const counts = {
    pending: data.documents.filter((d) => d.review_status === "pending").length,
    approved: data.documents.filter((d) => d.review_status === "approved").length,
    rejected: data.documents.filter((d) => d.review_status === "rejected").length,
  };

  return (
    <>
      <SectionCard title="Upload documents">
        <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="loan-pick">Loan</Label>
            <Select value={loanId} onValueChange={setLoanId}>
              <SelectTrigger id="loan-pick">
                <SelectValue placeholder="Choose a loan" />
              </SelectTrigger>
              <SelectContent>
                {data.loans.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.ref} · {l.product} ({l.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              PDF, JPG, PNG, WEBP, DOCX, XLSX or CSV · up to 15 MB each.
            </p>
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              aria-label="Choose loan documents"
              onChange={(e) => void upload(e.target.files)}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={busy || !loanId}>
              <UploadCloud className="mr-2 h-4 w-4" />
              {busy ? "Uploading…" : "Upload documents"}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-border px-6 py-3 text-xs text-muted-foreground">
          <span>Awaiting review: {counts.pending}</span>
          <span>Approved: {counts.approved}</span>
          <span>Needs attention: {counts.rejected}</span>
        </div>
      </SectionCard>

      <SectionCard
        title="My loan documents"
        action={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-56" aria-label="Filter by loan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All loans</SelectItem>
              {data.loans.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.ref}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No documents yet" hint="Uploaded loan documents appear here." />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {loanRef.get(d.loan_id) ?? "Loan"} · {humanBytes(d.size_bytes)} · uploaded{" "}
                    {new Date(d.created_at).toLocaleDateString()}
                  </div>
                  {d.review_note && d.review_status !== "pending" && (
                    <div className="mt-1 text-xs">
                      <span className="text-muted-foreground">Officer note: </span>
                      {d.review_note}
                    </div>
                  )}
                </div>
                <StatusPill status={d.review_status} />
                <div className="flex gap-1">
                  {isPreviewable(d.mime_type) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`View ${d.filename}`}
                      onClick={() => void open(d.id, "preview")}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Download ${d.filename}`}
                    onClick={() => void open(d.id, "download")}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {d.review_status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${d.filename}`}
                      disabled={del.isPending}
                      onClick={() => {
                        if (confirm(`Remove ${d.filename}?`)) del.mutate(d.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
