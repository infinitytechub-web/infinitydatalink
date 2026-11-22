import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useRef, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Eye, FileUp, Trash2, UploadCloud } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
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
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
  buildStoragePath,
  humanBytes,
  isPreviewable,
  validateUpload,
  type FileCategory,
} from "@/lib/files.shared";
import {
  deleteMyFile,
  listMyFiles,
  registerMyFile,
  signFileUrl,
  updateMyFile,
} from "@/lib/files.functions";

const filesQuery = queryOptions({
  queryKey: ["member", "files"],
  queryFn: () => listMyFiles(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_member/app/files")({
  head: () => ({
    meta: [
      { title: "My documents — IT-360 CashApp" },
      {
        name: "description",
        content:
          "Upload, preview and manage the documents you share with the credit union, with a full audit trail.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: () => null,
  errorComponent: ({ error }) => (
    <ErrorState title="Documents unavailable" message={(error as Error).message} />
  ),
  notFoundComponent: () => (
    <EmptyState title="Nothing here" hint="This document view does not exist." />
  ),
  component: MemberFilesPage,
});

function MemberFilesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="File management"
        title="My documents"
        description="Share supporting documents securely. Only you and authorised staff can open them, and every action is logged."
      />
      <Suspense fallback={<SectionCardSkeleton />}>
        <FilesWorkspace />
      </Suspense>
    </div>
  );
}

const REVIEW_PILL = {
  approved: "approved",
  rejected: "rejected",
  pending: "pending",
} as const;

function FilesWorkspace() {
  const { data } = useSuspenseQuery(filesQuery);
  const qc = useQueryClient();
  const register = useServerFn(registerMyFile);
  const remove = useServerFn(deleteMyFile);
  const update = useServerFn(updateMyFile);
  const sign = useServerFn(signFileUrl);

  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<FileCategory>("general");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | FileCategory>("all");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["member", "files"] });

  async function uploadFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    setProgress(0);
    let done = 0;
    for (const file of files) {
      const verdict = validateUpload({ filename: file.name, mime: file.type, size: file.size });
      if (!verdict.ok) {
        toast.error(`${file.name}: ${verdict.reasons.join(", ").replaceAll("_", " ")}`);
        done += 1;
        setProgress(Math.round((done / files.length) * 100));
        continue;
      }
      const { data: session } = await supabase.auth.getUser();
      const uid = session.user?.id;
      if (!uid) {
        toast.error("Your session expired — please sign in again.");
        break;
      }
      const path = buildStoragePath(uid, file.name);
      const { error: upErr } = await supabase.storage.from(FILE_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) {
        toast.error(`${file.name}: ${upErr.message}`);
        done += 1;
        setProgress(Math.round((done / files.length) * 100));
        continue;
      }
      try {
        await register({
          data: {
            storage_path: path,
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            category,
            shared_with_staff: true,
          },
        });
        toast.success(`${file.name} uploaded`);
      } catch (err) {
        await supabase.storage.from(FILE_BUCKET).remove([path]);
        toast.error((err as Error).message);
      }
      done += 1;
      setProgress(Math.round((done / files.length) * 100));
    }
    setProgress(null);
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

  const recategorise = useMutation({
    mutationFn: (vars: { id: string; category: FileCategory }) =>
      update({ data: { id: vars.id, category: vars.category } }),
    onSuccess: () => void invalidate(),
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

  const rows = data.files.filter(
    (f) =>
      (filter === "all" || f.category === filter) &&
      (search.trim() === "" || f.filename.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const usedPct = Math.min(100, Math.round((data.used_bytes / data.quota_bytes) * 100));

  return (
    <div className="space-y-6">
      <SectionCard title="Upload a document">
        <div className="p-5">
          <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as FileCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {FILE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void uploadFiles(e.dataTransfer.files);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${
                dragging ? "border-primary bg-primary/5" : "border-border"
              }`}
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud className="size-6 text-muted-foreground" />
              <p className="font-medium">Drop files here or click to choose</p>
              <p className="text-[11px] text-muted-foreground">
                Shared with the review team so they can verify your account faster.
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          {progress !== null ? (
            <div className="mt-3 space-y-1">
              <Progress value={progress} />
              <p className="text-[11px] text-muted-foreground">Uploading… {progress}%</p>
            </div>
          ) : null}
          <div className="mt-4 space-y-1">
            <Progress value={usedPct} />
            <p className="text-[11px] text-muted-foreground">
              {humanBytes(data.used_bytes)} of {humanBytes(data.quota_bytes)} used ({usedPct}%)
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="My documents"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search file name"
              className="h-9 w-44"
            />
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
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
          </div>
        }
      >
        <div className="p-5">
          {rows.length === 0 ? (
            <EmptyState
              title="No documents yet"
              hint="Upload your identity, address or income documents to speed up reviews."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2">File</th>
                    <th className="py-2">Category</th>
                    <th className="py-2">Size</th>
                    <th className="py-2">Review</th>
                    <th className="py-2">Uploaded</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((f) => (
                    <tr key={f.id}>
                      <td className="max-w-[240px] truncate py-2 font-medium">
                        <FileUp className="mr-1 inline size-3.5 text-muted-foreground" />
                        {f.filename}
                      </td>
                      <td className="py-2">
                        <Select
                          value={f.category}
                          onValueChange={(v) =>
                            recategorise.mutate({ id: f.id, category: v as FileCategory })
                          }
                          disabled={f.review_status !== "pending"}
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FILE_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {FILE_CATEGORY_LABELS[c]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                        {new Date(f.created_at).toLocaleDateString()}
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
                              if (confirm(`Remove ${f.filename}? This cannot be undone.`))
                                del.mutate(f.id);
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
        </div>
      </SectionCard>
    </div>
  );
}
