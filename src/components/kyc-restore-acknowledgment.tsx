/**
 * In-app acknowledgment for a KYC record that an administrator restored from the
 * account vault. The member confirms they reviewed the restored details; the
 * confirmation timestamp is stamped server-side and kept for audit purposes.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArchiveRestore, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/primitives";
import {
  acknowledgeKycRestore,
  getMyRestoreAcknowledgments,
  type RestoreAcknowledgment,
} from "@/lib/member-kyc.functions";

const prettify = (v: string | null | undefined) =>
  v ? String(v).replace(/_/g, " ") : null;

export function KycRestoreAcknowledgment() {
  const listFn = useServerFn(getMyRestoreAcknowledgments);
  const { data } = useQuery({
    queryKey: ["member", "kyc", "restore-acks"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <SectionCard title="Restored verification record">
      <ul className="divide-y divide-emerald-deep/5">
        {items.map((item) => (
          <RestoreRow key={item.id} item={item} />
        ))}
      </ul>
    </SectionCard>
  );
}

function RestoreRow({ item }: { item: RestoreAcknowledgment }) {
  const qc = useQueryClient();
  const ackFn = useServerFn(acknowledgeKycRestore);
  const [confirmed, setConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: () => ackFn({ data: { id: item.id } }),
    onSuccess: () => {
      toast.success("Thanks — your confirmation has been recorded.");
      qc.invalidateQueries({ queryKey: ["member", "kyc", "restore-acks"] });
      qc.invalidateQueries({ queryKey: ["member", "kyc", "status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const who = prettify(item.restored_by_role) ?? "an administrator";
  const docs =
    item.documents_restored > 0
      ? `${item.documents_restored} document${item.documents_restored === 1 ? "" : "s"}${
          item.document_types.length > 0
            ? ` (${item.document_types.map((t) => prettify(t)).join(", ")})`
            : ""
        }`
      : "No documents";

  return (
    <li className="space-y-3 px-6 py-5">
      <div className="flex items-start gap-3">
        <ArchiveRestore className="mt-0.5 h-4 w-4 text-emerald-mid" />
        <div className="flex-1 space-y-1 text-sm text-emerald-deep/80">
          <p className="font-semibold text-emerald-deep">
            Your KYC record was restored from the account vault
          </p>
          <p className="text-[12px]">
            Restored on {new Date(item.restored_at).toLocaleString()} by{" "}
            {item.restored_by_email ?? who}
            {item.restored_kyc ? ` · verification status set to "${prettify(item.restored_kyc)}"` : ""}
          </p>
          <p className="text-[12px]">Documents restored: {docs}</p>
          {item.reason ? (
            <p className="rounded border border-emerald-deep/10 bg-cream/40 px-3 py-2 text-[12px]">
              Reason given: {item.reason}
            </p>
          ) : null}
        </div>
      </div>

      {item.acknowledged_at ? (
        <div className="flex items-center gap-2 text-[12px] font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" />
          Reviewed and confirmed on {new Date(item.acknowledged_at).toLocaleString()}
        </div>
      ) : (
        <div className="space-y-3 rounded border border-emerald-deep/10 bg-cream/30 p-3">
          <label className="flex items-start gap-2 text-[12px] text-emerald-deep/80">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I confirm I have reviewed my restored verification details and documents, and that they
              are correct.
            </span>
          </label>
          <button
            type="button"
            disabled={!confirmed || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded bg-emerald-deep px-4 py-2 text-xs font-semibold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Confirm review
          </button>
        </div>
      )}
    </li>
  );
}
