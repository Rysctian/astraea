import { APPLICATION_TYPES, type ApplicationType } from "@starter/shared";
import { createFileRoute } from "@tanstack/react-router";
import { ApproverSetupPage } from "@/features/approver-setup/approver-setup-page";

interface ApproverSetupSearch {
  openCreate?: boolean;
  type?: ApplicationType;
}

export const Route = createFileRoute("/_protected/applications/approver-setup")({
  validateSearch: (search: Record<string, unknown>): ApproverSetupSearch => {
    const rawType = typeof search.type === "string" ? search.type : undefined;
    const validType = (APPLICATION_TYPES as readonly string[]).includes(rawType ?? "")
      ? (rawType as ApplicationType)
      : undefined;
    return {
      openCreate:
        search.openCreate === "1" || search.openCreate === true || search.openCreate === 1,
      type: validType,
    };
  },
  component: ApproverSetupRoute,
});

function ApproverSetupRoute() {
  const { openCreate, type } = Route.useSearch();
  return (
    <ApproverSetupPage
      initialOpenCreate={Boolean(openCreate)}
      initialApplicationType={type ?? "overtime"}
    />
  );
}
