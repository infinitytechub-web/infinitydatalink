import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_member/app/savings")({
  component: () => <Outlet />,
});
