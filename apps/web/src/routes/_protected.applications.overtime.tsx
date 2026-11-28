import { createFileRoute } from "@tanstack/react-router";
import { OvertimePage } from "@/features/overtime/overtime-page";

export const Route = createFileRoute("/_protected/applications/overtime")({
  component: OvertimePage,
});
