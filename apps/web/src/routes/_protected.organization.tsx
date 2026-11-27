import { createFileRoute } from "@tanstack/react-router";
import { OrganizationalSetupPage } from "@/features/organizational-setup/org-page";

export const Route = createFileRoute("/_protected/organization")({
  component: OrganizationalSetupPage,
});
