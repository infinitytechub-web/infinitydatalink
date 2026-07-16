import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { ErrorState, PageHeader } from "@/components/primitives";
import { EntityRegistrationWizard } from "@/components/entity-registration-wizard";
import type { EntityType } from "@/lib/admin-entities.functions";

const search = z.object({
  type: fallback(z.enum(["group", "department", "institution"]), "group").default("group"),
});

export const Route = createFileRoute("/_admin/admin/entities/register")({
  validateSearch: zodValidator(search),
  component: AdminRegisterEntity,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <ErrorState title="Could not open form" message={error.message} onRetry={() => router.invalidate()} />
      </div>
    );
  },
});

function AdminRegisterEntity() {
  const { type } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title={`Register a ${type}`}
        description="Onboard a new organization directly. Documents can be attached now or later."
      />
      <EntityRegistrationWizard
        initialType={type as EntityType}
        onComplete={(id) => navigate({ to: "/admin/entities/$entityId", params: { entityId: id } })}
      />
    </>
  );
}
