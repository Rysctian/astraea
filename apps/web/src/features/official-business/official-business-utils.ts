import type { ObType } from "@starter/shared";
import type { BadgeVariant } from "../approver-setup/approver-setup-utils";

export const OB_TYPE_META: Record<
  ObType,
  { badge: string; label: string; description: string; variant: BadgeVariant }
> = {
  ob: {
    badge: "OB",
    label: "Official Business",
    description: "Client visits, field assignments, seminars, or off-site travel",
    variant: "blue",
  },
  wfh: {
    badge: "WFH",
    label: "Work From Home",
    description: "Remote work arrangement performed outside the main office",
    variant: "purple",
  },
};

export function formatObDestination(obType: ObType, destination: string | null): string {
  if (destination && destination.trim().length > 0) {
    return destination.trim();
  }
  return obType === "wfh" ? "Work From Home" : "—";
}
