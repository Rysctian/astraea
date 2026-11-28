import { parseTimeToSeconds } from "@starter/shared";

export interface ScheduleSlotLike {
  dayOfWeek: number;
  isRestDay: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface TimeInterval {
  startSec: number;
  endSec: number;
  label: string;
}

const DAY_SECONDS = 24 * 3600;

export function addDaysIso(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + delta));
  return dt.toISOString().slice(0, 10);
}

export function getIsoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Builds all blocked work-shift intervals on `targetDate` (in seconds from 00:00:00):
 * 1) Same-day scheduled work shifts (non-rest-day; overnight shifts block [startSec, 86400]).
 * 2) Prior-day overnight shifts spilling past midnight into `targetDate` ([0, endSec]),
 *    even when `targetDate` itself is an explicit rest day.
 */
export function buildBlockedShiftIntervals(params: {
  targetDate: string;
  sameDayDetails: ScheduleSlotLike[];
  prevDayDetails: ScheduleSlotLike[];
}): { hasDayDefinition: boolean; blocked: TimeInterval[] } {
  const targetDow = getIsoWeekday(params.targetDate);
  const prevDow = getIsoWeekday(addDaysIso(params.targetDate, -1));

  const targetDayRows = params.sameDayDetails.filter((d) => d.dayOfWeek === targetDow);
  const hasDayDefinition = targetDayRows.length > 0;
  const blocked: TimeInterval[] = [];

  for (const slot of targetDayRows) {
    if (slot.isRestDay || !slot.startTime || !slot.endTime) {
      continue;
    }
    const startSec = parseTimeToSeconds(slot.startTime);
    const endSec = parseTimeToSeconds(slot.endTime);
    if (endSec > startSec) {
      blocked.push({
        startSec,
        endSec,
        label: `scheduled shift ${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}`,
      });
    } else if (endSec < startSec) {
      // Overnight shift starting today extends to midnight on targetDate
      blocked.push({
        startSec,
        endSec: DAY_SECONDS,
        label: `overnight shift ${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}`,
      });
    }
  }

  // Prior-day overnight spillover onto targetDate [00:00, endSec]
  const prevDayRows = params.prevDayDetails.filter((d) => d.dayOfWeek === prevDow);
  for (const slot of prevDayRows) {
    if (slot.isRestDay || !slot.startTime || !slot.endTime) {
      continue;
    }
    const startSec = parseTimeToSeconds(slot.startTime);
    const endSec = parseTimeToSeconds(slot.endTime);
    if (endSec < startSec && endSec > 0) {
      blocked.push({
        startSec: 0,
        endSec,
        label: `prior-day overnight shift ending at ${slot.endTime.slice(0, 5)}`,
      });
    }
  }

  return { hasDayDefinition, blocked };
}

export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function validateOvertimeSlotWindow(params: {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakSeconds: number;
  blockedShifts: TimeInterval[];
  existingOtIntervals: TimeInterval[];
}): { requestedSeconds: number } | { error: string } {
  const startSec = parseTimeToSeconds(params.startTime);
  const endSec = parseTimeToSeconds(params.endTime);

  if (endSec <= startSec) {
    return {
      error: `Overtime slot on ${params.date} must have an end time strictly after start time`,
    };
  }

  const gross = endSec - startSec;
  if (params.breakSeconds < 0 || params.breakSeconds >= gross) {
    return {
      error: `Break deduction on ${params.date} must be non-negative and strictly less than the slot duration`,
    };
  }

  for (const shift of params.blockedShifts) {
    if (intervalsOverlap(startSec, endSec, shift.startSec, shift.endSec)) {
      return {
        error: `Overtime slot ${params.startTime.slice(0, 5)}–${params.endTime.slice(0, 5)} on ${params.date} for ${params.employeeId} overlaps ${shift.label}`,
      };
    }
  }

  for (const existing of params.existingOtIntervals) {
    if (intervalsOverlap(startSec, endSec, existing.startSec, existing.endSec)) {
      return {
        error: `Overtime slot ${params.startTime.slice(0, 5)}–${params.endTime.slice(0, 5)} on ${params.date} for ${params.employeeId} overlaps ${existing.label}`,
      };
    }
  }

  return { requestedSeconds: gross - params.breakSeconds };
}
