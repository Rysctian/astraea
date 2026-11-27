import type { CutOffPeriodInput, CutOffPeriodRecord, CutOffScheduleType } from "@starter/shared";
import { format, isValid, parseISO } from "date-fns";

export const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

export function getMonthLabel(month: number): string {
  return MONTH_OPTIONS.find((m) => m.value === month)?.label ?? String(month);
}

export function formatScheduleType(type: CutOffScheduleType): string {
  return type === "semi_monthly" ? "Semi-Monthly" : "Monthly";
}

export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return "—";
  }
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? format(parsed, "MMM d, yyyy") : dateStr;
}

export function formatDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  if (!from || !to) {
    return "—";
  }
  const f = parseISO(from);
  const t = parseISO(to);
  if (isValid(f) && isValid(t)) {
    return `${format(f, "MMM d")} – ${format(t, "MMM d, yyyy")}`;
  }
  return `${from} – ${to}`;
}

export interface PeriodDraft {
  cutOffNo: 1 | 2;
  noDtr: boolean;
  dtrDateFrom: string;
  dtrDateTo: string;
  confirmationStartDate: string;
  confirmationEndDate: string;
  confirmationTimeFrom: string;
  confirmationTimeTo: string;
  payrollDateFrom: string;
  payrollDateTo: string;
  releaseDate: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function createDefaultPeriodDraft(
  cutOffNo: 1 | 2,
  year: number,
  month: number,
): PeriodDraft {
  const ym = `${year}-${pad2(month)}`;
  const lastDay = lastDayOfMonth(year, month);

  if (cutOffNo === 1) {
    return {
      cutOffNo: 1,
      noDtr: false,
      dtrDateFrom: `${ym}-01`,
      dtrDateTo: `${ym}-15`,
      confirmationStartDate: `${ym}-16`,
      confirmationEndDate: `${ym}-16`,
      confirmationTimeFrom: "08:00",
      confirmationTimeTo: "17:00",
      payrollDateFrom: `${ym}-01`,
      payrollDateTo: `${ym}-15`,
      releaseDate: `${ym}-20`,
    };
  }

  return {
    cutOffNo: 2,
    noDtr: false,
    dtrDateFrom: `${ym}-16`,
    dtrDateTo: `${ym}-${pad2(lastDay)}`,
    confirmationStartDate: `${ym}-${pad2(lastDay)}`,
    confirmationEndDate: `${ym}-${pad2(lastDay)}`,
    confirmationTimeFrom: "08:00",
    confirmationTimeTo: "17:00",
    payrollDateFrom: `${ym}-16`,
    payrollDateTo: `${ym}-${pad2(lastDay)}`,
    releaseDate: `${ym}-${pad2(lastDay)}`,
  };
}

export function recordToPeriodDraft(record: CutOffPeriodRecord): PeriodDraft {
  return {
    cutOffNo: record.cutOffNo === 2 ? 2 : 1,
    noDtr: record.noDtr,
    dtrDateFrom: record.dtrDateFrom ?? "",
    dtrDateTo: record.dtrDateTo ?? "",
    confirmationStartDate: record.confirmationStartDate ?? "",
    confirmationEndDate: record.confirmationEndDate ?? "",
    confirmationTimeFrom: record.confirmationTimeFrom
      ? record.confirmationTimeFrom.slice(0, 5)
      : "",
    confirmationTimeTo: record.confirmationTimeTo ? record.confirmationTimeTo.slice(0, 5) : "",
    payrollDateFrom: record.payrollDateFrom,
    payrollDateTo: record.payrollDateTo,
    releaseDate: record.releaseDate,
  };
}

export function periodDraftToPayload(draft: PeriodDraft): CutOffPeriodInput {
  return {
    cutOffNo: draft.cutOffNo,
    noDtr: draft.noDtr,
    dtrDateFrom: draft.noDtr ? null : draft.dtrDateFrom || null,
    dtrDateTo: draft.noDtr ? null : draft.dtrDateTo || null,
    confirmationStartDate: draft.noDtr ? null : draft.confirmationStartDate || null,
    confirmationEndDate: draft.noDtr ? null : draft.confirmationEndDate || null,
    confirmationTimeFrom: draft.noDtr ? null : draft.confirmationTimeFrom || null,
    confirmationTimeTo: draft.noDtr ? null : draft.confirmationTimeTo || null,
    payrollDateFrom: draft.payrollDateFrom,
    payrollDateTo: draft.payrollDateTo,
    releaseDate: draft.releaseDate,
  };
}
