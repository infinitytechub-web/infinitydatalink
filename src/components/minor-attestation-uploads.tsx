import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing, FileText, Upload } from "lucide-react";
import { SectionCard } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MINOR_ATTESTATION_MAX_BYTES,
  MINOR_ATTESTATION_TYPES,
  listMinorAttestations,
  sendGuardianConsentReminders,
  uploadMinorAttestation,
  type MinorAttestation,
  type MinorAttestationType,
} from "@/lib/minor-attestations.functions";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.docx";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function prettyBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Guardian consent & safeguarding attestation attachments for a minor account.
 * Files land in the shared documents register, so every upload is later
 * auditable (view / download / export) by Super Admins.
 */
export function MinorAttestationUploads({ memberId }: { memberId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listMinorAttestations);
  const upload = useServerFn(uploadMinorAttestation);
  const remind = useServerFn(sendGuardianConsentReminders);
  const fileInput = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<MinorAttestationType>("guardian_consent");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["minor-attestations", memberId],
    queryFn: () => list({ data: { member_id: memberId } }),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file to attach.");
      if (file.size > MINOR_ATTESTATION_MAX_BYTES)
        throw new Error("File is larger than the 8 MB limit.");
      const content_base64 = await readAsBase64(file);
      return upload({
        data: {
          member_id: memberId,
          doc_type: docType,
          filename: file.name,
          mime_type: file.type as never,
          content_base64,
          note: note.trim(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Attestation attached to the documents register.");
      setFile(null);
      setNote("");
      if (fileInput.current) fileInput.current.value = "";
      void qc.invalidateQueries({ queryKey: ["minor-attestations", memberId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reminders = useMutation({
    mutationFn: () => remind({ data: {} }),
    onSuccess: (r: { incomplete: number; staff_notified: number; guardians_notified: number }) =>
      toast.success(
        `Reminders sent — ${r.incomplete} incomplete minor account(s), ${r.staff_notified} officer alert(s), ${r.guardians_notified} guardian alert(s).`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data ?? []) as MinorAttestation[];
  const canSubmit = !!file && note.trim().length >= 4 && !mutation.isPending;

  return (
    <SectionCard title="Guardian consent & safeguarding attestations">
      <div className="space-y-4 p-6">
        <p className="text-xs text-muted-foreground">
          Attach the signed guardian consent and the completed safeguarding attestation supporting
          this minor decision. Files are stored with the member's verification documents and appear
          in the Super Admin documents register for later audit. PDF, JPEG, PNG or DOCX up to
          8&nbsp;MB.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Attestation type
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as MinorAttestationType)}
              className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-emerald-mid"
            >
              {MINOR_ATTESTATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            File
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-emerald-mid"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Reference / context
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. CONSENT-2026-014 — signed by guardian on 12 Jul 2026"
            className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-emerald-mid"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded bg-emerald-deep px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
          >
            <Upload className="h-3.5 w-3.5" />
            {mutation.isPending ? "Uploading…" : "Attach attestation"}
          </button>
          <button
            type="button"
            disabled={reminders.isPending}
            onClick={() => reminders.mutate()}
            className="inline-flex items-center gap-2 rounded border border-emerald-deep/20 px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:border-emerald-mid disabled:opacity-40"
          >
            <BellRing className="h-3.5 w-3.5" />
            {reminders.isPending ? "Sending…" : "Send consent reminders"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Reminders also run automatically each night: officers get an in-app + email alert
          deep-linked to the member review screen, and the guardian gets in-app, email and SMS
          notices until the consent and safeguarding files are on file.
        </p>

        <div className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Attached files
          </h3>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No attestations attached yet.</p>
          ) : (
            <ul className="divide-y divide-emerald-deep/10 rounded border border-emerald-deep/15">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-xs">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-bold uppercase tracking-widest text-muted-foreground">
                    {r.label}
                  </span>
                  <span className="text-muted-foreground">{r.filename}</span>
                  <span className="text-muted-foreground">{prettyBytes(r.size_bytes)}</span>
                  <span className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                  {r.review_notes ? (
                    <span className="basis-full text-muted-foreground">{r.review_notes}</span>
                  ) : null}
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto rounded border border-emerald-deep/20 px-2 py-1 font-bold uppercase tracking-widest text-muted-foreground hover:border-emerald-mid"
                    >
                      Open
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
