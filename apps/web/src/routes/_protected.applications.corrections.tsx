import { createFileRoute } from "@tanstack/react-router";
import { CorrectionsPage } from "@/features/corrections/corrections-page";

export const Route = createFileRoute("/_protected/applications/corrections")({
  component: CorrectionsPage,
});
