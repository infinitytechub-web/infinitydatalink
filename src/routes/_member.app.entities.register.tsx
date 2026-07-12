import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ErrorState, PageHeader, SectionCard } from "@/components/primitives";
import { registerEntity } from "@/lib/admin-entities.functions";

export const Route = createFileRoute("/_member/app/entities/register")({
  component: RegisterEntity,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState title="Could not open form" message={error.message} onRetry={() => router.invalidate()} />
      </div>
    );
  },
});

function RegisterEntity() {
  const navigate = useNavigate();
  const registerFn = useServerFn(registerEntity);
  const [form, setForm] = useState({
    type: "group" as "group" | "department" | "institution",
    name: "",
    registration_no: "",
    tax_id: "",
    contact_email: "",
    contact_phone: "",
    region: "",
    address_line: "",
    digital_address: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      registerFn({
        data: {
          type: form.type,
          name: form.name,
          registration_no: form.registration_no || null,
          tax_id: form.tax_id || null,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          region: form.region || null,
          address_line: form.address_line || null,
          digital_address: form.digital_address || null,
        },
      }),
    onSuccess: () => {
      toast.success("Registration submitted for review");
      navigate({ to: "/app" });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title="Register an organization"
        description="Register a group, department, or institution. Compliance will review and activate it."
      />
      <SectionCard title="Organization details">
        <form
          className="grid gap-4 p-6 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim().length < 2) {
              toast.error("Name is required");
              return;
            }
            mutation.mutate();
          }}
        >
          <Field label="Type">
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}
            >
              <option value="group">Group</option>
              <option value="department">Department</option>
              <option value="institution">Institution</option>
            </select>
          </Field>
          <Field label="Name">
            <input required className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Registration number">
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} />
          </Field>
          <Field label="Tax ID">
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
          </Field>
          <Field label="Contact email">
            <input type="email" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </Field>
          <Field label="Contact phone">
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
          </Field>
          <Field label="Region">
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
          </Field>
          <Field label="Digital address">
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.digital_address} onChange={(e) => setForm({ ...form, digital_address: e.target.value })} />
          </Field>
          <Field label="Physical address" className="md:col-span-2">
            <textarea className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" rows={2}
              value={form.address_line} onChange={(e) => setForm({ ...form, address_line: e.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-md bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </form>
      </SectionCard>
    </>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
