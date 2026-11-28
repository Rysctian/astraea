import { createFileRoute } from "@tanstack/react-router";
import { OfficialBusinessPage } from "@/features/official-business/official-business-page";

export const Route = createFileRoute("/_protected/applications/official-business")({
  component: OfficialBusinessPage,
});
