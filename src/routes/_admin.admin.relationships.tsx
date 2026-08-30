import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listRelationshipTypes,
  setRelationshipTypeActive,
  upsertRelationshipType,
  type RelationshipType,
} from "@/lib/relationship-types.functions";

export const Route = createFileRoute("/_admin/admin/relationships")({
  head: () => ({
    meta: [
      { title: "Relationship Types — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RelationshipTypesPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      Unable to load relationship types: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
});

const inputCls = "min-h-[44px] rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm";
const labelCls =
  "flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground";

function RelationshipTypesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listRelationshipTypes);
  const upsert = useServerFn(upsertRelationshipType);
  const toggle = useServerFn(setRelationshipTypeActive);

  const query = useQuery({ queryKey: ["relationship-types"], queryFn: () => list() });

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [sortOrder, setSortOrder] = useState(500);
  const [editing, setEditing] = useState<RelationshipType | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["relationship-types"] });

  const save = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: editing?.id,
          code: code.trim().toLowerCase(),
          label: label.trim(),
          sort_order: sortOrder,
          is_active: editing?.is_active ?? true,
        },
      }),
    onSuccess: () => {
      toast.success(editing ? "Relationship updated" : "Relationship added");
      setEditing(null);
      setCode("");
      setLabel("");
      setSortOrder(500);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActive = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggle({ data: v }),
    onSuccess: () => {
      toast.success("Saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Relationship types"
        description="Manage the relationship options offered for next of kin, guarantors and beneficiaries. Only Super Admins may change this list; every change is audited."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SectionCard title="Available relationships">
          {query.isLoading ? (
            <div className="p-6">
              <Skeleton className="h-48 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No relationship types configured yet.
            </p>
          ) : (
            <ul className="divide-y divide-emerald-deep/5">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {r.label}
                      {!r.is_active ? (
                        <span className="ml-2 rounded bg-emerald-deep/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                          Inactive
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-emerald-deep/55">
                      {r.code} · order {r.sort_order}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditing(r);
                        setCode(r.code);
                        setLabel(r.label);
                        setSortOrder(r.sort_order);
                      }}
                      className="min-h-[40px] rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setActive.mutate({ id: r.id, is_active: !r.is_active })}
                      className="min-h-[40px] rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream"
                    >
                      {r.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={editing ? "Edit relationship" : "Add relationship"}>
          <form
            className="grid gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <label className={labelCls}>
              Label
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                placeholder="e.g. Guardian"
                className={`${inputCls} font-normal normal-case tracking-normal`}
              />
            </label>
            <label className={labelCls}>
              Code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                pattern="[a-z0-9_]+"
                placeholder="guardian"
                className={`${inputCls} font-normal normal-case tracking-normal`}
              />
              <span className="font-normal normal-case tracking-normal text-muted-foreground">
                Lowercase letters, digits and underscores only.
              </span>
            </label>
            <label className={labelCls}>
              Sort order
              <input
                type="number"
                min={1}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className={`${inputCls} font-normal normal-case tracking-normal`}
              />
            </label>
            <div className="flex justify-end gap-2">
              {editing ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setCode("");
                    setLabel("");
                    setSortOrder(500);
                  }}
                  className="min-h-[44px] rounded border border-emerald-deep/15 px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-cream"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="submit"
                disabled={save.isPending}
                className="min-h-[44px] rounded bg-emerald-deep px-3 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
              >
                {save.isPending ? "Saving…" : editing ? "Save changes" : "Add relationship"}
              </button>
            </div>
          </form>
        </SectionCard>
      </div>
    </>
  );
}
