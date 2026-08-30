import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { CheckCircle2, Download, Eye, Trash2, XCircle } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SectionCard,
  SectionCardSkeleton,
  StatusPill,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportCsv } from "@/lib/exports";
import {
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
  humanBytes,
  isPreviewable,
} from "@/lib/files.shared";
import {
  adminDeleteFile,
  adminListFiles,
  adminReviewFile,
  signFileUrl,
  type MemberFile,
} from "@/lib/files.functions";

const SearchSchema = z.object({
  status: z.enum(["all", "pending", "approved", "rejected"]).default("pending"),
  category: z.string().default("all"),
  q: z.string().default(""),
  date_from: z.string().default(""),
  date_to: z.string().default(""),
  page: z.number().int().min(1).default(1),
});
type FileSearch = z.infer<typeof SearchSchema>;

const PAGE_SIZE = 25;

function listQuery(s: FileSearch) {
  return queryOptions({
    queryKey: ["admin", "files", s],
    queryFn: () =>
      adminListFiles({
        data: {
          status: s.status,
          category: s.category,
          search: s.q || null,
          date_from: s.date_from || null,
          date_to: s.date_to || null,
          page: s.page,
          page_size: PAGE_SIZE,
        },
      }),
    staleTime: 10_000,
  });
}

export const Route = createFileRoute("/_admin/admin/files")({
  validateSearch: (s: Record<string, unknown>) => SearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "File management — IT-360 CashApp Admin" },
      {
        name: "description",
        content:
          "Review member documents, preview or download them, approve or reject with a note, and export the register.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <ErrorState title="File register unavailable" message={error.message} />
  ),
  notFoundComponent: () => (
    <EmptyState title="Nothing here" hint="This file view does not exist." />
  ),
  component: AdminFilesPage,
});

function AdminFilesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="File management"
        title="Member documents"
        description="Every document members share with the institution. Previews and downloads are signed for two minutes and written to the audit trail."
      />
      <Suspense fallback={<SectionCardSkeleton />}>
        <FileRegister />
      </Suspense>
    </div>
  );
}

const REVIEW_PILL = { approved: "approved", rejected: "rejected", pending: "pending" } as const;

function FileRegister() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(listQuery(search));
  const qc = useQueryClient();

  const sign = useServerFn(signFileUrl);
  const review = useServerFn(adminReviewFile);
  const destroy = useServerFn(adminDeleteFile);

  const [target, setTarget] = useState<{
    file: MemberFile;
    mode: "approved" | "rejected" | "delete";
  } | null>(null);
  const [note, setNote] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "files"] });
  const setSearch = (patch: Partial<FileSearch>) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, ...patch }) });

  const decide = useMutation({
    mutationFn: async () => {
      if (!target) return;
      if (target.mode === "delete") {
        await destroy({ data: { id: target.file.id, reason: note } });
      } else {
        await review({ data: { id: target.file.id, decision: target.mode, note } });
      }
    },
    onSuccess: () => {
      toast.success(target?.mode === "delete" ? "Document deleted" : `Document ${target?.mode}`);
      setTarget(null);
      setNote("");
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

  const pages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <SectionCard
      title={`Documents (${data.total})`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-9 w-40"
            placeholder="File name"
            value={search.q}
            onChange={(e) => setSearch({ q: e.target.value })}
          />
          <Select
            value={search.status}
            onValueChange={(v) => setSearch({ status: v as FileSearch["status"] })}
          >
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={search.category} onValueChange={(v) => setSearch({ category: v })}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {FILE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {FILE_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="h-9 w-36"
            value={search.date_from}
            onChange={(e) => setSearch({ date_from: e.target.value })}
          />
          <Input
            type="date"
            className="h-9 w-36"
            value={search.date_to}
            onChange={(e) => setSearch({ date_to: e.target.value })}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCsv({
                title: "Member documents",
                filename: "member-files",
                rows: data.rows,
                columns: [
                  { header: "Owner", accessor: (r: MemberFile) => r.owner_label },
                  { header: "File", accessor: (r: MemberFile) => r.filename },
                  { header: "Category", accessor: (r: MemberFile) => r.category },
                  { header: "Type", accessor: (r: MemberFile) => r.mime_type },
                  { header: "Size", accessor: (r: MemberFile) => r.size_bytes },
                  { header: "Review", accessor: (r: MemberFile) => r.review_status },
                  { header: "Note", accessor: (r: MemberFile) => r.review_note ?? "" },
                  { header: "Uploaded", accessor: (r: MemberFile) => r.created_at },
                ],
              })
            }
          >
            Export CSV
          </Button>
        </div>
      }
    >
      <div className="p-5">
        {data.rows.length === 0 ? (
          <EmptyState title="No documents match" hint="Adjust the filters to widen the search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2">Owner</th>
                  <th className="py-2">File</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Size</th>
                  <th className="py-2">Review</th>
                  <th className="py-2">Uploaded</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((f) => (
                  <tr key={f.id}>
                    <td className="max-w-[180px] truncate py-2">{f.owner_label}</td>
                    <td className="max-w-[220px] truncate py-2 font-medium">{f.filename}</td>
                    <td className="py-2">
                      {FILE_CATEGORY_LABELS[f.category as never] ?? f.category}
                    </td>
                    <td className="py-2 tabular-nums">{humanBytes(f.size_bytes)}</td>
                    <td className="py-2">
                      <StatusPill status={REVIEW_PILL[f.review_status]} />
                      {f.review_note ? (
                        <p className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">
                          {f.review_note}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2 text-[11px] text-muted-foreground">
                      {new Date(f.created_at).toLocaleString()}
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        {isPreviewable(f.mime_type) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void open(f.id, "preview")}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void open(f.id, "download")}
                        >
                          <Download className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setNote("");
                            setTarget({ file: f, mode: "approved" });
                          }}
                        >
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setNote("");
                            setTarget({ file: f, mode: "rejected" });
                          }}
                        >
                          <XCircle className="size-3.5 text-amber-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setNote("");
                            setTarget({ file: f, mode: "delete" });
                          }}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {data.page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={data.page <= 1}
              onClick={() => navigate({ search: (p) => ({ ...p, page: Math.max(1, p.page - 1) }) })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={data.page >= pages}
              onClick={() => navigate({ search: (p) => ({ ...p, page: p.page + 1 }) })}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.mode === "delete"
                ? "Delete document"
                : target?.mode === "approved"
                  ? "Approve document"
                  : "Reject document"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {target?.file.filename} · {target?.file.owner_label}
            </p>
            <div className="space-y-1.5">
              <Label>
                {target?.mode === "delete" ? "Reason for deletion" : "Decision note"} (min 10
                characters)
              </Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={
                  target?.mode === "rejected"
                    ? "Explain what the member must correct — this is shown to them."
                    : "Recorded in the audit trail."
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={note.trim().length < 10 || decide.isPending}
              variant={target?.mode === "delete" ? "destructive" : "default"}
              onClick={() => decide.mutate()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
