import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/admin/entities")({
  head: () => ({ meta: [{ title: "Entities — IT-360 CashApp" }, { name: "robots", content: "noindex" }] }),
  component: () => <Outlet />,
});
