import { createFileRoute } from "@tanstack/react-router";
import { CutOffsPage } from "@/features/cut-offs/cut-offs-page";

export const Route = createFileRoute("/_protected/attendance/cut-offs")({
  component: CutOffsPage,
});
