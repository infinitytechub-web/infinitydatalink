import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useRef, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Clock, FileText, Loader2, Lock, Trash2, Upload, X, XCircle } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getOrgConfig, ORG_PRESETS, setOrgConfig } from "@/lib/org-config";
import {
  createKycUploadUrl,
  deleteMyPendingKycDocument,
  deleteNextOfKin,
  getMyProfile,
  registerKycDocument,
  updateMyProfile,
  upsertNextOfKin,
  type KycDocStatus,
  type KycDocType,
  type KycDocument,
  type MemberProfileFull,
  type NextOfKin,
  type ProfileKycStatus,
} from "@/lib/member-profile.functions";

export const Route = createFileRoute("/_member/app/profile")({
  head: () => ({
    meta: [
      { title: "Profile & KYC — IT-360 CashApp" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Profile unavailable: {error.message}</div>
  ),
});

const profileQuery = queryOptions({
  queryKey: ["member", "profile"],
  queryFn: () => getMyProfile(),
  staleTime: 30_000,
});

function ProfilePage() {
  return (
    <>
      <PageHeader
        eyebrow="Member portal"
        title="Profile & KYC"
        description="Personal details, next of kin, and identity verification."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ProfileBody />
      </Suspense>
    </>
  );
}

function ProfileBody() {
  const { data } = useSuspenseQuery(profileQuery);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <KycBanner status={data.profile.kyc} notes={data.profile.kyc_notes} reviewedAt={data.profile.kyc_reviewed_at} />
        <PersonalDetailsForm profile={data.profile} />
        <NextOfKinSection rows={data.next_of_kin} />
        <DocumentsSection documents={data.documents} />
      </div>
      <div className="space-y-6">
        <RegionPresetCard />
        <MembershipCard profile={data.profile} />
      </div>
    </div>
  );
}

// ---------- KYC banner ----------
function KycBanner({
  status,
  notes,
  reviewedAt,
}: {
  status: ProfileKycStatus;
  notes: string | null;
  reviewedAt: string | null;
}) {
  const map: Record<ProfileKycStatus, { label: string; hint: string; className: string; Icon: typeof Clock }> = {
    pending: {
      label: "Verification pending",
      hint: "Upload the required documents below. A reviewer will approve or reject shortly.",
      className: "border-gold/40 bg-gold/10 text-gold",
      Icon: Clock,
    },
    active: {
      label: "Identity verified",
      hint: reviewedAt ? `Reviewed on ${new Date(reviewedAt).toLocaleDateString()}.` : "Reviewed.",
      className: "border-emerald-mid/40 bg-emerald-mid/10 text-emerald-mid",
      Icon: CheckCircle2,
    },
    rejected: {
      label: "Verification rejected",
      hint: notes ?? "Please review the reviewer notes and re-upload the required documents.",
      className: "border-destructive/40 bg-destructive/10 text-destructive",
      Icon: XCircle,
    },
  };
  const { label, hint, className, Icon } = map[status];
  return (
    <div className={`flex items-start gap-3 rounded border p-4 text-sm ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="text-[11px] font-bold uppercase tracking-widest">{label}</p>
        <p className="mt-1 text-xs">{hint}</p>
      </div>
      {status !== "active" ? (
        <Link
          to="/app/kyc"
          className="shrink-0 self-center rounded border border-current px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-current/10"
        >
          View status →
        </Link>
      ) : null}
    </div>
  );
}

// ---------- Personal details ----------
function PersonalDetailsForm({ profile }: { profile: MemberProfileFull["profile"] }) {
  const qc = useQueryClient();
  const update = useServerFn(updateMyProfile);
  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    phone: profile.phone ?? "",
    national_id: profile.national_id ?? "",
    region: profile.region ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    gender: profile.gender ?? "",
    digital_address: profile.digital_address ?? "",
    address_line: profile.address_line ?? "",
    occupation: profile.occupation ?? "",
    employer: profile.employer ?? "",
  });
  const identityLocked = profile.kyc === "active";
  const mutation = useMutation({
    mutationFn: () => update({ data: form }),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["member", "profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <SectionCard title="Personal details">
      <form
        className="grid gap-4 p-6 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <TextField label="Full name" value={form.full_name} onChange={setField("full_name")} required />
        <TextField label="Email" value={profile.email ?? ""} onChange={() => {}} disabled />
        <TextField label="Phone" value={form.phone} onChange={setField("phone")} placeholder="+233 …" />
        <TextField
          label="Date of birth"
          value={form.date_of_birth}
          onChange={setField("date_of_birth")}
          type="date"
          disabled={identityLocked}
          hint={identityLocked ? "Locked after verification" : undefined}
        />
        <SelectField
          label="Gender"
          value={form.gender}
          onChange={setField("gender")}
          options={["", "female", "male", "non-binary", "prefer_not_to_say"]}
        />
        <TextField label="Region" value={form.region} onChange={setField("region")} />
        <TextField label="Digital address" value={form.digital_address} onChange={setField("digital_address")} placeholder="GA-123-4567" />
        <TextField label="Residential address" value={form.address_line} onChange={setField("address_line")} className="sm:col-span-2" />
        <TextField
          label="National ID"
          value={form.national_id}
          onChange={setField("national_id")}
          disabled={identityLocked}
          hint={identityLocked ? "Locked after verification" : undefined}
        />
        <TextField label="Occupation" value={form.occupation} onChange={setField("occupation")} />
        <TextField label="Employer" value={form.employer} onChange={setField("employer")} className="sm:col-span-2" />

        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          {identityLocked ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald-deep/50">
              <Lock className="h-3 w-3" /> Some fields locked after verification
            </span>
          ) : null}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-emerald-deep px-4 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

// ---------- Next of kin ----------
type NokDraft = {
  id?: string;
  full_name: string;
  relationship: string;
  phone: string;
  email: string;
  national_id: string;
  address: string;
};
const EMPTY_NOK: NokDraft = { full_name: "", relationship: "", phone: "", email: "", national_id: "", address: "" };

function NextOfKinSection({ rows }: { rows: NextOfKin[] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<NokDraft | null>(null);
  const upsert = useServerFn(upsertNextOfKin);
  const del = useServerFn(deleteNextOfKin);

  const save = useMutation({
    mutationFn: (v: NokDraft) =>
      upsert({
        data: {
          id: v.id,
          full_name: v.full_name,
          relationship: v.relationship,
          phone: v.phone || null,
          email: v.email || null,
          national_id: v.national_id || null,
          address: v.address || null,
        },
      }),
    onSuccess: () => {
      toast.success("Next of kin saved");
      qc.invalidateQueries({ queryKey: ["member", "profile"] });
      setDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Next of kin removed");
      qc.invalidateQueries({ queryKey: ["member", "profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      title="Next of kin"
      action={
        <button
          onClick={() => setDraft(EMPTY_NOK)}
          className="rounded bg-emerald-deep px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid"
        >
          Add next of kin
        </button>
      }
    >
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-emerald-deep/60">
          No next of kin recorded. Add at least one trusted contact for account recovery and beneficiary purposes.
        </div>
      ) : (
        <ul className="divide-y divide-emerald-deep/5">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-2 px-6 py-4 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm font-semibold">{r.full_name}</p>
                <p className="text-xs text-emerald-deep/60">
                  {r.relationship}
                  {r.phone ? ` · ${r.phone}` : ""}
                  {r.email ? ` · ${r.email}` : ""}
                </p>
                {r.address ? <p className="text-[11px] text-emerald-deep/50">{r.address}</p> : null}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() =>
                    setDraft({
                      id: r.id,
                      full_name: r.full_name,
                      relationship: r.relationship,
                      phone: r.phone ?? "",
                      email: r.email ?? "",
                      national_id: r.national_id ?? "",
                      address: r.address ?? "",
                    })
                  }
                  className="rounded border border-emerald-deep/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove ${r.full_name}?`)) remove.mutate(r.id);
                  }}
                  className="rounded border border-destructive/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <NokDialog
          value={draft}
          onChange={setDraft}
          onSave={() => save.mutate(draft)}
          isSaving={save.isPending}
        />
      ) : null}
    </SectionCard>
  );
}

function NokDialog({
  value,
  onChange,
  onSave,
  isSaving,
}: {
  value: NokDraft;
  onChange: (v: NokDraft | null) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const set = (k: keyof NokDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded border border-emerald-deep/15 bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-emerald-deep/10 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-deep">
            {value.id ? "Edit next of kin" : "Add next of kin"}
          </p>
          <button
            onClick={() => onChange(null)}
            className="rounded border border-emerald-deep/15 p-1 hover:bg-cream"
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <form
          className="grid gap-3 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <TextField label="Full name" value={value.full_name} onChange={set("full_name")} required />
          <TextField label="Relationship" value={value.relationship} onChange={set("relationship")} required placeholder="e.g. Spouse" />
          <TextField label="Phone" value={value.phone} onChange={set("phone")} />
          <TextField label="Email" value={value.email} onChange={set("email")} type="email" />
          <TextField label="National ID" value={value.national_id} onChange={set("national_id")} />
          <TextField label="Address" value={value.address} onChange={set("address")} className="sm:col-span-2" />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded border border-emerald-deep/15 px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !value.full_name || !value.relationship}
              className="rounded bg-emerald-deep px-3 py-2 text-xs font-bold uppercase tracking-widest text-cream hover:bg-emerald-mid disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Documents ----------
const DOC_LABELS: Record<KycDocType, string> = {
  national_id_front: "National ID (front)",
  national_id_back: "National ID (back)",
  selfie: "Selfie holding ID",
  proof_of_address: "Proof of address",
  other: "Other",
};

const DOC_SLOTS: KycDocType[] = ["national_id_front", "national_id_back", "selfie", "proof_of_address"];

function DocumentsSection({ documents }: { documents: KycDocument[] }) {
  const grouped = new Map<KycDocType, KycDocument[]>();
  for (const d of documents) {
    const arr = grouped.get(d.doc_type) ?? [];
    arr.push(d);
    grouped.set(d.doc_type, arr);
  }
  const others = documents.filter((d) => d.doc_type === "other");

  return (
    <SectionCard title="KYC documents">
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        {DOC_SLOTS.map((t) => (
          <DocumentSlot key={t} type={t} label={DOC_LABELS[t]} docs={grouped.get(t) ?? []} />
        ))}
        <DocumentSlot key="other" type="other" label={DOC_LABELS.other} docs={others} className="sm:col-span-2" />
      </div>
    </SectionCard>
  );
}

function DocumentSlot({
  type,
  label,
  docs,
  className,
}: {
  type: KycDocType;
  label: string;
  docs: KycDocument[];
  className?: string;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createKycUploadUrl);
  const register = useServerFn(registerKycDocument);
  const del = useServerFn(deleteMyPendingKycDocument);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const signed = await create({
        data: { doc_type: type, filename: file.name, mime_type: file.type, size_bytes: file.size },
      });
      const { error: upErr } = await supabase.storage
        .from("kyc-documents")
        .uploadToSignedUrl(signed.storage_path, signed.token, file, { contentType: file.type });
      if (upErr) throw upErr;
      await register({
        data: {
          doc_type: type,
          storage_path: signed.storage_path,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      toast.success(`Uploaded ${label}`);
      qc.invalidateQueries({ queryKey: ["member", "profile"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const deletion = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed");
      qc.invalidateQueries({ queryKey: ["member", "profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={`rounded border border-emerald-deep/10 bg-card p-4 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-deep">{label}</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded border border-emerald-deep/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-cream disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {uploading ? "Uploading" : "Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
      {docs.length === 0 ? (
        <p className="mt-3 text-xs text-emerald-deep/50">JPG, PNG or PDF · up to 8 MB.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded bg-cream/50 px-3 py-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-3 w-3 shrink-0 text-emerald-deep/50" />
                <div className="min-w-0">
                  <p className="truncate">{d.storage_path.split("/").pop()}</p>
                  <p className="text-[10px] text-emerald-deep/50">
                    Uploaded {new Date(d.created_at).toLocaleDateString()} · {(d.size_bytes / 1024).toFixed(0)} KB
                  </p>
                  {d.status === "rejected" && d.review_notes ? (
                    <p className="mt-0.5 text-[10px] text-destructive">Reviewer: {d.review_notes}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <DocStatusPill status={d.status} />
                {d.status === "pending" ? (
                  <button
                    onClick={() => {
                      if (window.confirm("Remove this document?")) deletion.mutate(d.id);
                    }}
                    className="rounded border border-destructive/30 p-1 text-destructive hover:bg-destructive/10"
                    aria-label="Remove document"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DocStatusPill({ status }: { status: KycDocStatus }) {
  const map = {
    pending: "bg-gold/10 text-gold",
    approved: "bg-emerald-mid/10 text-emerald-mid",
    rejected: "bg-destructive/10 text-destructive",
  } as const;
  return (
    <span className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${map[status]}`}>
      {status}
    </span>
  );
}

// ---------- Sidebar cards ----------
function RegionPresetCard() {
  const cfg = getOrgConfig();
  const [region, setRegion] = useState(cfg.id);
  return (
    <div className="rounded border border-emerald-deep/5 bg-card p-6 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/50">Region preset</p>
      <select
        value={region}
        onChange={(e) => {
          setRegion(e.target.value);
          setOrgConfig(e.target.value as keyof typeof ORG_PRESETS);
          window.location.reload();
        }}
        className="w-full rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm"
      >
        {Object.values(ORG_PRESETS).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.currency.code}
          </option>
        ))}
      </select>
      <p className="mt-2 text-[11px] text-emerald-deep/50">Controls currency, ID label, and MoMo providers.</p>
    </div>
  );
}

function MembershipCard({ profile }: { profile: MemberProfileFull["profile"] }) {
  return (
    <div className="rounded border border-emerald-deep/5 bg-card p-6 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-deep/50">Membership</p>
      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/40">Member no.</dt>
          <dd className="tabular mt-1">{profile.member_no ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/40">Tier</dt>
          <dd className="mt-1 capitalize">{profile.tier}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-emerald-deep/40">KYC status</dt>
          <dd className="mt-1 capitalize">{profile.kyc}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------- Inputs ----------
function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  required,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60 ${className ?? ""}`}>
      {label}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal text-emerald-deep outline-none focus:border-emerald-mid disabled:bg-cream/50 disabled:text-emerald-deep/50"
      />
      {hint ? <span className="text-[10px] font-normal text-emerald-deep/50">{hint}</span> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-deep/60">
      {label}
      <select
        value={value}
        onChange={onChange}
        className="rounded border border-emerald-deep/15 bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal text-emerald-deep outline-none focus:border-emerald-mid"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o ? o.replace(/_/g, " ") : "—"}
          </option>
        ))}
      </select>
    </label>
  );
}
