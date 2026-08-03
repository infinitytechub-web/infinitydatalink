import { useMemo, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SectionCard } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import {
  ACTIONS,
  ACTION_LABELS,
  MODULES,
  MODULE_LABELS,
  type PermAction,
  type PermModule,
} from "@/lib/permissions";
import { EDITABLE_ROLES, ROLE_LABELS, type EditableRole } from "@/lib/permission-matrix";
import { getPermissionMatrix, saveRolePermissions } from "@/lib/admin-permissions.functions";

export const matrixQuery = () =>
  queryOptions({
    queryKey: ["admin", "permission-matrix"],
    queryFn: () => getPermissionMatrix(),
  });

export function PermissionMatrixEditor() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const editable = can("users", "manage");
  const { data } = useSuspenseQuery(matrixQuery());
  const [role, setRole] = useState<EditableRole>("manager");
  const [draft, setDraft] = useState<Set<string> | null>(null);

  const saved = useMemo(() => {
    const row = data.rows.find((r) => r.role === role);
    return new Set(row?.capabilities ?? []);
  }, [data.rows, role]);

  const current = draft ?? saved;
  const dirty = draft
    ? draft.size !== saved.size || [...draft].some((c) => !saved.has(c))
    : false;

  const setRoleAndReset = (next: EditableRole) => {
    setRole(next);
    setDraft(null);
  };

  const toggle = (cap: string) => {
    if (!editable) return;
    setDraft(() => {
      const next = new Set(current);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return next;
    });
  };

  const toggleModule = (module: PermModule, on: boolean) => {
    if (!editable) return;
    setDraft(() => {
      const next = new Set(current);
      for (const a of ACTIONS) {
        const cap = `${module}.${a}`;
        if (on) next.add(cap);
        else next.delete(cap);
      }
      return next;
    });
  };

  const toggleAction = (action: PermAction, on: boolean) => {
    if (!editable) return;
    setDraft(() => {
      const next = new Set(current);
      for (const m of MODULES) {
        const cap = `${m}.${action}`;
        if (on) next.add(cap);
        else next.delete(cap);
      }
      return next;
    });
  };

  const save = useMutation({
    mutationFn: () =>
      saveRolePermissions({ data: { role, capabilities: [...current] } }),
    onSuccess: async (res) => {
      toast.success(`${ROLE_LABELS[role]} updated — ${res.count} permissions active`);
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["admin", "permission-matrix"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save permissions"),
  });

  return (
    <SectionCard title="Permission matrix">
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {EDITABLE_ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRoleAndReset(r)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider transition ${
                role === r
                  ? "border-emerald-deep bg-emerald-deep text-white"
                  : "border-emerald-deep/20 bg-emerald-deep/10 text-emerald-deep hover:bg-emerald-deep/20"
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">
            {current.size} permission{current.size === 1 ? "" : "s"} granted
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Super Admin always has full access and cannot be edited. Changes are enforced in the
          database, so hiding a button also blocks the underlying request.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-emerald-deep/5 text-left uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Module</th>
                {ACTIONS.map((a) => {
                  const allOn = MODULES.every((m) => current.has(`${m}.${a}`));
                  return (
                    <th key={a} className="px-2 py-2 text-center">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => toggleAction(a, !allOn)}
                        className="hover:text-emerald-deep disabled:cursor-not-allowed"
                        title={`Toggle ${ACTION_LABELS[a]} for every module`}
                      >
                        {ACTION_LABELS[a]}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => {
                const allOn = ACTIONS.every((a) => current.has(`${m}.${a}`));
                return (
                  <tr key={m} className="border-t border-emerald-deep/10">
                    <td className="px-3 py-2 font-semibold">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => toggleModule(m, !allOn)}
                        className="text-left hover:text-emerald-deep disabled:cursor-not-allowed"
                        title={`Toggle every action for ${MODULE_LABELS[m]}`}
                      >
                        {MODULE_LABELS[m]}
                      </button>
                    </td>
                    {ACTIONS.map((a) => {
                      const cap = `${m}.${a}`;
                      return (
                        <td key={a} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={current.has(cap)}
                            disabled={!editable}
                            onChange={() => toggle(cap)}
                            aria-label={`${MODULE_LABELS[m]} — ${ACTION_LABELS[a]}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {editable && (
          <div className="flex flex-wrap items-center gap-2 border-t border-emerald-deep/10 pt-4">
            <button
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              className="rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save permissions"}
            </button>
            <button
              onClick={() => setDraft(null)}
              disabled={!dirty || save.isPending}
              className="rounded border border-emerald-deep/20 px-4 py-2 text-xs font-semibold uppercase tracking-widest disabled:opacity-50"
            >
              Reset
            </button>
            {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
