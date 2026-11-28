import { durationTypeToDayValue, type LeaveDurationType, roundCreditValue } from "@starter/shared";

export interface LeavePolicyRules {
  minNoticeDays: number;
  allowBackdatedFiling: boolean;
  maxBackdatedDays: number | null;
  maxConsecutiveDays: number | null;
  allowHalfDay: boolean;
  allowNegativeBalance: boolean;
  countRestDays: boolean;
  allowAttachments: boolean;
  requireAttachment: boolean;
}

export interface RequestedLeaveDetail {
  date: string;
  durationType: LeaveDurationType;
}

export interface ActiveLeaveDetailLike {
  applicationId: number;
  date: string;
  durationType: LeaveDurationType;
}

function parseUtcDateMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1);
}

const MS_PER_DAY = 86_400_000;

export function diffCalendarDays(fromIso: string, toIso: string): number {
  return Math.round((parseUtcDateMs(toIso) - parseUtcDateMs(fromIso)) / MS_PER_DAY);
}

/**
 * Computes the longest consecutive calendar-day run across a set of unique ISO dates.
 */
export function computeMaxConsecutiveDays(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...new Set(dates)].sort();
  let best = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev && curr && diffCalendarDays(prev, curr) === 1) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 1;
    }
  }
  return best;
}

/**
 * Validates requested leave rows against the resolved Leave Policy rules.
 * Returns null if valid, or a descriptive validation error message.
 */
export function validateLeaveDatesAgainstPolicy(params: {
  details: RequestedLeaveDetail[];
  policy: LeavePolicyRules;
  todayIso: string;
  restDates: Set<string>;
}): string | null {
  const { details, policy, todayIso, restDates } = params;
  if (details.length === 0) {
    return "Select at least one leave date";
  }

  const sorted = [...details].sort((a, b) => a.date.localeCompare(b.date));

  for (const row of sorted) {
    if (!policy.allowHalfDay && row.durationType !== "whole_day") {
      return `Half-day leave (${row.durationType}) is not allowed under this leave policy`;
    }

    if (!policy.countRestDays && restDates.has(row.date)) {
      return `Date ${row.date} is a scheduled rest day and cannot be filed under this leave policy`;
    }

    const daysFromToday = diffCalendarDays(todayIso, row.date);
    if (daysFromToday < 0) {
      if (!policy.allowBackdatedFiling) {
        return `Backdated leave filing for ${row.date} is not permitted under this leave policy`;
      }
      const pastDays = Math.abs(daysFromToday);
      if (policy.maxBackdatedDays !== null && pastDays > policy.maxBackdatedDays) {
        return `Date ${row.date} is ${pastDays} days in the past, exceeding the maximum backdated limit of ${policy.maxBackdatedDays} days`;
      }
    } else if (policy.minNoticeDays > 0 && daysFromToday < policy.minNoticeDays) {
      return `Leave on ${row.date} requires at least ${policy.minNoticeDays} days advance notice`;
    }
  }

  if (policy.maxConsecutiveDays !== null) {
    const maxRun = computeMaxConsecutiveDays(sorted.map((d) => d.date));
    if (maxRun > policy.maxConsecutiveDays) {
      return `Requested leave includes ${maxRun} consecutive days, exceeding the policy maximum of ${policy.maxConsecutiveDays} consecutive days`;
    }
  }

  return null;
}

/**
 * Checks for date/duration conflicts against existing pending/approved leave rows.
 * Complementary `half_day_am` + `half_day_pm` pairing on the same date is permitted (Rule 4).
 */
export function checkLeaveDateConflicts(params: {
  requested: RequestedLeaveDetail[];
  existingActive: ActiveLeaveDetailLike[];
}): string | null {
  const byDate = new Map<string, ActiveLeaveDetailLike[]>();
  for (const row of params.existingActive) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }

  for (const req of params.requested) {
    const existingList = byDate.get(req.date);
    if (!existingList || existingList.length === 0) continue;

    for (const ex of existingList) {
      if (req.durationType === "whole_day" || ex.durationType === "whole_day") {
        return `Date ${req.date} conflicts with existing leave application #${ex.applicationId}`;
      }
      if (req.durationType === ex.durationType) {
        const halfLabel = req.durationType === "half_day_am" ? "AM" : "PM";
        return `Date ${req.date} (${halfLabel} half-day) conflicts with existing leave application #${ex.applicationId}`;
      }
    }
  }

  return null;
}

/**
 * Groups requested day values by calendar year in ascending year order
 * so credit rows are always locked deterministically across multi-year spans.
 */
export function groupRequestedDaysByYear(details: RequestedLeaveDetail[]): Array<{
  year: number;
  days: number;
}> {
  const map = new Map<number, number>();
  for (const row of details) {
    const year = Number(row.date.slice(0, 4));
    const current = map.get(year) ?? 0;
    map.set(year, roundCreditValue(current + durationTypeToDayValue(row.durationType)));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, days]) => ({ year, days }));
}
