import { cn } from "@/lib/utils";

export type SortState = { sortBy: string; sortDir: "asc" | "desc" };

export function SortHeader({
  label,
  field,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  field: string;
  sort: SortState;
  onSort: (next: SortState) => void;
  align?: "left" | "right";
}) {
  const active = sort.sortBy === field;
  const arrow = active ? (sort.sortDir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th
      className={cn(
        "px-6 py-3 font-medium select-none cursor-pointer hover:text-emerald-deep",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={() =>
        onSort({
          sortBy: field,
          sortDir: active && sort.sortDir === "desc" ? "asc" : "desc",
        })
      }
    >
      {label} <span className="ml-1 text-[9px] opacity-60">{arrow}</span>
    </th>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (n: number) => void;
  onPageSize: (n: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t border-emerald-deep/5 bg-cream/30 px-6 py-3 text-[11px] text-muted-foreground">
      <div className="tabular">
        {from}–{to} of {total}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="uppercase tracking-widest text-[10px] text-muted-foreground">
            Per page
          </span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded border border-emerald-deep/15 bg-card px-2 py-1 text-xs outline-none focus:border-emerald-mid"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="rounded border border-emerald-deep/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
          >
            Prev
          </button>
          <span className="tabular px-2">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            className="rounded border border-emerald-deep/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
