import type { ApplicationType } from "@starter/shared";

export type BadgeVariant = "neutral" | "blue" | "emerald" | "amber" | "purple";

export const APPLICATION_TYPE_META: Record<
  ApplicationType,
  { label: string; shortLabel: string; description: string; variant: BadgeVariant }
> = {
  overtime: {
    label: "Overtime",
    shortLabel: "Overtime",
    description: "Pre- or post-shift extra hours outside scheduled shifts",
    variant: "blue",
  },
  official_business: {
    label: "Official Business",
    shortLabel: "Official Business",
    description: "Off-site meetings, field work, and external business travel",
    variant: "purple",
  },
  correction: {
    label: "Attendance Correction",
    shortLabel: "Correction",
    description: "Missed time-in/out logs and biometric log adjustments",
    variant: "amber",
  },
  leave: {
    label: "Leave",
    shortLabel: "Leave",
    description: "Vacation, sick, emergency, and statutory leave filings",
    variant: "emerald",
  },
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "E";
  if (parts.length === 1) return (parts[0] ?? "E").slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

export function formatShortTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
