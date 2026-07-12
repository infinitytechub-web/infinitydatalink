import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/admin/entities")({
  head: () => ({ meta: [{ title: "Entities — Infinity Wealth" }, { name: "robots", content: "noindex" }] }),
  component: () => <Outlet />,
});
