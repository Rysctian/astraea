import { createFileRoute } from "@tanstack/react-router";
import { ReferenceSetupPage } from "@/features/reference-setup/reference-page";

export const Route = createFileRoute("/_protected/setup/administrative")({
  component: () => <ReferenceSetupPage group="administrative" />,
});
