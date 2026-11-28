import type { LeaveAccrualMode, LeaveCreditChangeType, LeaveDurationType } from "@starter/shared";
import type { BadgeVariant } from "../approver-setup/approver-setup-utils";

export const LEAVE_DURATION_LABELS: Record<LeaveDurationType, string> = {
  whole_day: "Whole Day (1.0)",
  half_day_am: "Half Day AM (0.5)",
  half_day_pm: "Half Day PM (0.5)",
};

export const LEAVE_ACCRUAL_LABELS: Record<LeaveAccrualMode, string> = {
  upfront_annual: "Upfront Annual",
  monthly_accrual: "Monthly Accrual",
  none: "None / Manual",
};

export const CREDIT_CHANGE_META: Record<
  LeaveCreditChangeType,
  { label: string; variant: BadgeVariant; sign: "+" | "-" | "" }
> = {
  grant: { label: "Grant", variant: "emerald", sign: "+" },
  adjustment: { label: "Adjustment", variant: "blue", sign: "" },
  reserve: { label: "Reserve", variant: "amber", sign: "-" },
  deduct: { label: "Deduct", variant: "purple", sign: "-" },
  release: { label: "Release", variant: "emerald", sign: "+" },
  restore: { label: "Restore", variant: "emerald", sign: "+" },
};

export function formatDays(days: number): string {
  const rounded = Math.round(days * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
  return `${text} ${rounded === 1 ? "day" : "days"}`;
}

export function expandIsoDateRange(fromIso: string, toIso: string, maxDays = 60): string[] {
  if (!fromIso || !toIso || toIso < fromIso) return [];
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const start = Date.UTC(fy ?? 2026, (fm ?? 1) - 1, fd ?? 1);
  const end = Date.UTC(ty ?? 2026, (tm ?? 1) - 1, td ?? 1);
  const result: string[] = [];
  for (let ms = start; ms <= end && result.length < maxDays; ms += 86_400_000) {
    result.push(new Date(ms).toISOString().slice(0, 10));
  }
  return result;
}
