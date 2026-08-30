import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FileType2,
  Loader2,
  Pencil,
  Printer,
  ShieldAlert,
  Table2,
  Trash2,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  exportCsv,
  exportDocx,
  exportExcel,
  exportPdf,
  exportPrint,
  type ExportColumn,
} from "@/lib/exports";
import {
  deleteManagedDocument,
  exportManagedDocuments,
  formatLabel,
  getManagedDocumentUrl,
  listManagedDocuments,
  updateManagedDocument,
  type ManagedDocument,
} from "@/lib/admin-documents.functions";

export const Route = createFileRoute("/_admin/admin/documents")({
  head: () => ({
    meta: [
      { title: "Document Management — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      Document register unavailable: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
});

const FORMATS = ["", "PDF", "CSV", "DOCX", "DOC", "XLSX", "XLS", "JPEG", "PNG"];

function DocumentsPage() {
  const { user } = useAuth();
  const isSuperAdmin = (user?.roles ?? []).includes("super_admin");

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Document Management"
        description="View, edit, print, download and delete every stored document, and export the register to PDF, CSV, DOCX or XLSX. Restricted to Super Admins; every action is written to the audit trail."
      />
      {!isSuperAdmin ? (
        <SectionCard title="Restricted area">
          <div className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p>
              Document download, print and export are limited to the <strong>Super Admin</strong>{" "}
              role. Your account does not hold that role, so the register is not shown. Requests are
              also rejected server-side and logged.
            </p>
          </div>
        </SectionCard>
      ) : (
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <DocumentsBody />
        </Suspense>
      )}
    </>
  );
}

const REGISTER_COLUMNS: ExportColumn<ManagedDocument>[] = [
  { header: "Owner", accessor: (r) => r.owner_label },
  { header: "Source", accessor: (r) => r.source },
  { header: "Type", accessor: (r) => r.doc_type.replace(/_/g, " ") },
  { header: "Format", accessor: (r) => formatLabel(r.mime_type) },
  {
    header: "Size (KB)",
    accessor: (r) => Math.max(1, Math.round(r.size_bytes / 1024)),
    align: "right",
  },
  { header: "Status", accessor: (r) => r.status ?? "—" },
  { header: "Filename", accessor: (r) => r.filename },
  {
    header: "Uploaded",
    accessor: (r) => new Date(r.created_at).toISOString().slice(0, 19).replace("T", " "),
  },
];

function ExportButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={
        label === "Print" ? "Print document register" : `Export document register as ${label}`
      }
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded border border-emerald-deep/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-cream disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

function DocumentsBody() {
  const qc = useQueryClient();
  const [source, setSource] = useState<"all" | "kyc" | "entity">("all");
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<"created_at" | "size_bytes" | "doc_type">("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [editing, setEditing] = useState<ManagedDocument | null>(null);

  const list = useServerFn(listManagedDocuments);
  const urlFn = useServerFn(getManagedDocumentUrl);
  const del = useServerFn(deleteManagedDocument);
  const exportFn = useServerFn(exportManagedDocuments);

  const exportRun = useMutation({
    mutationFn: async (output: "pdf" | "csv" | "docx" | "xlsx" | "print") => {
      const res = await exportFn({
        data: {
          source,
          search: search || undefined,
          format: format || undefined,
          sort,
          dir,
          output,
        },
      });
      return { ...res, output };
    },
    onSuccess: async ({ rows: all, truncated, output }) => {
      if (all.length === 0) {
        toast.error("No documents match these filters.");
        return;
      }
      const opts = {
        title: "Document register",
        subtitle: `${source === "all" ? "All sources" : source === "kyc" ? "Member KYC uploads" : "Entity documents"}${format ? ` · ${format}` : ""}${search ? ` · “${search}”` : ""}`,
        filename: "document-register",
        columns: REGISTER_COLUMNS,
        rows: all,
      };
      if (output === "pdf") await exportPdf(opts);
      else if (output === "csv") exportCsv(opts);
      else if (output === "docx") await exportDocx(opts);
      else if (output === "xlsx") await exportExcel(opts);
      else await exportPrint(opts);

      if (truncated) toast.warning("Export capped at the first 5,000 documents.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const query = useQuery({
    queryKey: ["admin", "documents", { source, search, format, page, pageSize, sort, dir }],
    queryFn: () =>
      list({
        data: {
          source,
          search: search || undefined,
          format: format || undefined,
          page,
          page_size: pageSize,
          sort,
          dir,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const open = useMutation({
    mutationFn: (v: { row: ManagedDocument; intent: "view" | "download" | "print" }) =>
      urlFn({ data: { source: v.row.source, id: v.row.id, intent: v.intent } }).then((r) => ({
        ...r,
        intent: v.intent,
      })),
    onSuccess: (r) => {
      const win = window.open(r.url, "_blank", "noopener,noreferrer");
      if (!win) {
        toast.error("Allow pop-ups to open documents.");
        return;
      }
      if (r.intent === "print") {
        win.addEventListener("load", () => win.print(), { once: true });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (v: { row: ManagedDocument; reason: string }) =>
      del({ data: { source: v.row.source, id: v.row.id, reason: v.reason } }),
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["admin", "documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <SectionCard title="Document register">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Search
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Owner, filename or type"
              className="min-h-[44px] rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Source
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value as typeof source);
                setPage(1);
              }}
              className="min-h-[44px] rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal"
            >
              <option value="all">All sources</option>
              <option value="kyc">Member KYC uploads</option>
              <option value="entity">Entity documents</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Format
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setPage(1);
              }}
              className="min-h-[44px] rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal"
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f || "All formats"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Sort
            <select
              value={`${sort}:${dir}`}
              onChange={(e) => {
                const [s, d] = e.target.value.split(":");
                setSort(s as typeof sort);
                setDir(d as typeof dir);
              }}
              className="min-h-[44px] rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal"
            >
              <option value="created_at:desc">Newest first</option>
              <option value="created_at:asc">Oldest first</option>
              <option value="size_bytes:desc">Largest first</option>
              <option value="doc_type:asc">Document type A→Z</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-deep/10 px-4 py-3">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {total} document{total === 1 ? "" : "s"}
            {exportRun.isPending ? " · preparing export…" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <ExportButton
              icon={<FileText className="h-3.5 w-3.5" />}
              label="PDF"
              disabled={exportRun.isPending}
              onClick={() => exportRun.mutate("pdf")}
            />
            <ExportButton
              icon={<Table2 className="h-3.5 w-3.5" />}
              label="CSV"
              disabled={exportRun.isPending}
              onClick={() => exportRun.mutate("csv")}
            />
            <ExportButton
              icon={<FileType2 className="h-3.5 w-3.5" />}
              label="DOCX"
              disabled={exportRun.isPending}
              onClick={() => exportRun.mutate("docx")}
            />
            <ExportButton
              icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
              label="XLSX"
              disabled={exportRun.isPending}
              onClick={() => exportRun.mutate("xlsx")}
            />
            <ExportButton
              icon={<Printer className="h-3.5 w-3.5" />}
              label="Print"
              disabled={exportRun.isPending}
              onClick={() => exportRun.mutate("print")}
            />
          </div>
        </div>

        {query.isLoading ? (
          <div className="p-6">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No documents match these filters.</p>
        ) : (
          <ul className="divide-y divide-emerald-deep/5">
            {rows.map((r) => (
              <li
                key={`${r.source}-${r.id}`}
                className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{r.owner_label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.doc_type.replace(/_/g, " ")} · {formatLabel(r.mime_type)} ·{" "}
                    {Math.max(1, Math.round(r.size_bytes / 1024))} KB
                    {r.status ? ` · ${r.status}` : ""}
                  </p>
                  <p className="truncate text-[11px] text-emerald-deep/45">
                    {r.filename} · {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <IconAction label="View" onClick={() => open.mutate({ row: r, intent: "view" })}>
                    <Eye className="h-3.5 w-3.5" />
                  </IconAction>
                  <IconAction
                    label="Download"
                    onClick={() => open.mutate({ row: r, intent: "download" })}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </IconAction>
                  <IconAction
                    label="Print"
                    onClick={() => open.mutate({ row: r, intent: "print" })}
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </IconAction>
                  <IconAction label="Edit metadata" onClick={() => setEditing(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconAction>
                  <button
                    aria-label={`Delete ${r.filename}`}
                    onClick={() => {
                      const reason = window.prompt(
                        `Deleting “${r.filename}” is permanent. Enter a reason (min 5 characters):`,
                      );
                      if (!reason) return;
                      if (reason.trim().length < 5) {
                        toast.error("A deletion reason of at least 5 characters is required.");
                        return;
                      }
                      remove.mutate({ row: r, reason: reason.trim() });
                    }}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded border border-destructive/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10"
                  >
                    {remove.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-deep/10 px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground">
          <label className="flex items-center gap-2">
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border border-emerald-deep/15 bg-card px-2 py-1 text-xs normal-case tracking-normal"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="min-h-[36px] rounded border border-emerald-deep/15 px-3 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {page} / {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="min-h-[36px] rounded border border-emerald-deep/15 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>

      {editing ? <EditDialog row={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex min-h-[40px] items-center gap-1 rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream"
    >
      {children}
    </button>
  );
}

function EditDialog({ row, onClose }: { row: ManagedDocument; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useServerFn(updateManagedDocument);
  const [docType, setDocType] = useState(row.doc_type);
  const [notes, setNotes] = useState(row.review_notes ?? "");
  const [status, setStatus] = useState(row.status ?? "pending");

  const save = useMutation({
    mutationFn: () =>
      update({
        data: {
          source: row.source,
          id: row.id,
          doc_type: docType,
          review_notes: row.source === "kyc" ? notes || null : undefined,
          status:
            row.source === "kyc" ? (status as "pending" | "approved" | "rejected") : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Document updated");
      qc.invalidateQueries({ queryKey: ["admin", "documents"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t border border-emerald-deep/15 bg-card shadow-xl sm:rounded">
        <div className="border-b border-emerald-deep/10 px-4 py-3 text-[11px] font-bold uppercase tracking-widest">
          Edit document metadata
        </div>
        <form
          className="grid gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <p className="truncate text-xs text-muted-foreground">{row.filename}</p>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Document type
            <input
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="min-h-[44px] rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal"
            />
          </label>
          {row.source === "kyc" ? (
            <>
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="min-h-[44px] rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal"
                >
                  <option value="pending">pending</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Review notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal"
                />
              </label>
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded border border-emerald-deep/15 px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="min-h-[44px] rounded bg-emerald-deep px-3 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
