import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SectionCard } from "@/components/primitives";
import { cn } from "@/lib/utils";
import {
  listInstitutions,
  registerEntity,
  uploadEntityDocument,
  type EntityType,
} from "@/lib/admin-entities.functions";

type WizardForm = {
  type: EntityType;
  name: string;
  registration_no: string;
  tax_id: string;
  parent_entity_id: string;
  contact_email: string;
  contact_phone: string;
  region: string;
  address_line: string;
  digital_address: string;
};

const EMPTY: WizardForm = {
  type: "group",
  name: "",
  registration_no: "",
  tax_id: "",
  parent_entity_id: "",
  contact_email: "",
  contact_phone: "",
  region: "",
  address_line: "",
  digital_address: "",
};

const STEP_TITLES = ["Type", "Basics", "Contact", "Documents", "Review"] as const;

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
    r.readAsDataURL(file);
  });
}

export function EntityRegistrationWizard({
  initialType = "group",
  onComplete,
}: {
  initialType?: EntityType;
  onComplete?: (entityId: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>({ ...EMPTY, type: initialType });
  const [pendingDocs, setPendingDocs] = useState<
    {
      file: File;
      doc_type: "registration_cert" | "tax_cert" | "mandate_letter" | "id_document" | "other";
    }[]
  >([]);

  const registerFn = useServerFn(registerEntity);
  const uploadFn = useServerFn(uploadEntityDocument);

  const institutionsQuery = useQuery({
    queryKey: ["entity-parent-institutions"],
    queryFn: () => listInstitutions(),
    enabled: form.type === "department",
  });

  const requiresParent = form.type === "department";
  const requiresTax = form.type === "institution";

  const canAdvance = useMemo(() => {
    if (step === 0) return !!form.type;
    if (step === 1) {
      if (form.name.trim().length < 2) return false;
      if (requiresParent && !form.parent_entity_id) return false;
      if (requiresTax && !form.tax_id.trim()) return false;
      return true;
    }
    return true;
  }, [step, form, requiresParent, requiresTax]);

  const submit = useMutation({
    mutationFn: async () => {
      const { id } = await registerFn({
        data: {
          type: form.type,
          name: form.name.trim(),
          registration_no: form.registration_no.trim() || null,
          tax_id: form.tax_id.trim() || null,
          parent_entity_id: form.parent_entity_id || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          region: form.region.trim() || null,
          address_line: form.address_line.trim() || null,
          digital_address: form.digital_address.trim() || null,
        },
      });
      for (const doc of pendingDocs) {
        try {
          const b64 = await fileToBase64(doc.file);
          await uploadFn({
            data: {
              entity_id: id,
              doc_type: doc.doc_type,
              filename: doc.file.name,
              mime_type: doc.file.type,
              content_base64: b64,
            },
          });
        } catch (err: any) {
          toast.error(`Document ${doc.file.name} failed: ${err.message}`);
        }
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success("Registration submitted");
      onComplete?.(id);
    },
    onError: (e: any) => toast.error(e.message || "Failed to submit"),
  });

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {STEP_TITLES.map((t, i) => (
          <li key={t} className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold",
                i < step
                  ? "border-primary bg-primary text-primary-foreground"
                  : i === step
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                "font-medium",
                i === step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {t}
            </span>
            {i < STEP_TITLES.length - 1 ? <span className="mx-1 h-px w-6 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <SectionCard title={STEP_TITLES[step]}>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          {step === 0 ? (
            <div className="md:col-span-2 grid gap-3 sm:grid-cols-3">
              {(["group", "department", "institution"] as EntityType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      type: t,
                      parent_entity_id: "",
                      tax_id: t === "institution" ? form.tax_id : "",
                    })
                  }
                  className={cn(
                    "rounded-lg border p-4 text-left transition",
                    form.type === t
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <div className="text-sm font-semibold capitalize">{t}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t === "group" && "A cooperative or savings circle."}
                    {t === "department" && "A unit belonging to an institution."}
                    {t === "institution" && "A registered corporate or public body."}
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {step === 1 ? (
            <>
              <Field label="Legal name" required>
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Registration number">
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={form.registration_no}
                  onChange={(e) => setForm({ ...form, registration_no: e.target.value })}
                />
              </Field>
              {requiresTax ? (
                <Field label="Tax ID" required>
                  <input
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={form.tax_id}
                    onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                  />
                </Field>
              ) : null}
              {requiresParent ? (
                <Field label="Parent institution" required>
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={form.parent_entity_id}
                    onChange={(e) => setForm({ ...form, parent_entity_id: e.target.value })}
                  >
                    <option value="">Select institution…</option>
                    {(institutionsQuery.data ?? []).map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Region">
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Field label="Contact email">
                <input
                  type="email"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                />
              </Field>
              <Field label="Contact phone">
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                />
              </Field>
              <Field label="Digital address">
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={form.digital_address}
                  onChange={(e) => setForm({ ...form, digital_address: e.target.value })}
                />
              </Field>
              <Field label="Physical address" className="md:col-span-2">
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  rows={2}
                  value={form.address_line}
                  onChange={(e) => setForm({ ...form, address_line: e.target.value })}
                />
              </Field>
            </>
          ) : null}

          {step === 3 ? (
            <div className="md:col-span-2 space-y-3">
              <p className="text-xs text-muted-foreground">
                Attach registration certificate, tax certificate, or a mandate letter (PDF/PNG/JPEG,
                up to 10 MB each). You can upload these later from the entity page.
              </p>
              <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-xs text-muted-foreground hover:bg-muted">
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    setPendingDocs((prev) => [
                      ...prev,
                      ...files.map((f) => ({ file: f, doc_type: "registration_cert" as const })),
                    ]);
                    e.target.value = "";
                  }}
                />
                Click to add documents
              </label>
              {pendingDocs.length > 0 ? (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {pendingDocs.map((d, idx) => (
                    <li key={idx} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <span className="flex-1 truncate">{d.file.name}</span>
                      <select
                        className="rounded border border-border bg-background px-2 py-1"
                        value={d.doc_type}
                        onChange={(e) => {
                          const v = e.target.value as typeof d.doc_type;
                          setPendingDocs((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, doc_type: v } : x)),
                          );
                        }}
                      >
                        <option value="registration_cert">Registration cert.</option>
                        <option value="tax_cert">Tax certificate</option>
                        <option value="mandate_letter">Mandate letter</option>
                        <option value="id_document">ID document</option>
                        <option value="other">Other</option>
                      </select>
                      <button
                        type="button"
                        className="text-destructive hover:underline"
                        onClick={() => setPendingDocs((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="md:col-span-2 space-y-3 text-sm">
              <ReviewRow label="Type" value={form.type} />
              <ReviewRow label="Name" value={form.name} />
              <ReviewRow label="Registration no." value={form.registration_no || "—"} />
              {requiresTax ? <ReviewRow label="Tax ID" value={form.tax_id || "—"} /> : null}
              {requiresParent ? (
                <ReviewRow
                  label="Parent institution"
                  value={
                    (institutionsQuery.data ?? []).find((i) => i.id === form.parent_entity_id)
                      ?.name ?? "—"
                  }
                />
              ) : null}
              <ReviewRow
                label="Contact"
                value={`${form.contact_email || "—"} · ${form.contact_phone || "—"}`}
              />
              <ReviewRow label="Region" value={form.region || "—"} />
              <ReviewRow label="Address" value={form.address_line || "—"} />
              <ReviewRow label="Digital address" value={form.digital_address || "—"} />
              <ReviewRow label="Documents" value={`${pendingDocs.length} attached`} />
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submit.isPending}
            className="rounded-md border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            Back
          </button>
          {step < STEP_TITLES.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              className="rounded-md bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
              className="rounded-md bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {submit.isPending ? "Submitting…" : "Submit for review"}
            </button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-2">
      <span className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 text-sm">{value}</span>
    </div>
  );
}
