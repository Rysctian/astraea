import { createFileRoute } from "@tanstack/react-router";
import { type LeaveMainTab, LeavePage } from "@/features/leave/leave-page";

interface LeaveRouteSearch {
  tab?: LeaveMainTab;
}

export const Route = createFileRoute("/_protected/applications/leave")({
  validateSearch: (search: Record<string, unknown>): LeaveRouteSearch => {
    const raw = search.tab;
    if (raw === "applications" || raw === "setup" || raw === "policies") {
      return { tab: raw };
    }
    return {};
  },
  component: LeaveRoute,
});

function LeaveRoute() {
  const { tab } = Route.useSearch();
  return <LeavePage initialTab={tab ?? "applications"} />;
}
