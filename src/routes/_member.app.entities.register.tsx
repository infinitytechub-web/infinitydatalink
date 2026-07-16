import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ErrorState, PageHeader } from "@/components/primitives";
import { EntityRegistrationWizard } from "@/components/entity-registration-wizard";

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
  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title="Register an organization"
        description="Register a group, department, or institution. Compliance will review and activate it."
      />
      <EntityRegistrationWizard onComplete={() => navigate({ to: "/app" })} />
    </>
  );
}
