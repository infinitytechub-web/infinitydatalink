import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/admin/finance")({
  head: () => ({
    meta: [{ title: "Finance — Infinity Wealth" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Outlet />,
});
