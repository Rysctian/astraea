import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

export const ISO_WEEKDAYS = [
  { dayOfWeek: 1, codeDay: "M", label: "Monday" },
  { dayOfWeek: 2, codeDay: "T", label: "Tuesday" },
  { dayOfWeek: 3, codeDay: "W", label: "Wednesday" },
  { dayOfWeek: 4, codeDay: "TH", label: "Thursday" },
  { dayOfWeek: 5, codeDay: "F", label: "Friday" },
  { dayOfWeek: 6, codeDay: "S", label: "Saturday" },
  { dayOfWeek: 7, codeDay: "SUN", label: "Sunday" },
] as const;

export function getCodeDay(dayOfWeek: number): string {
  return ISO_WEEKDAYS.find((d) => d.dayOfWeek === dayOfWeek)?.codeDay ?? "M";
}

export function getWeekdayLabel(dayOfWeek: number): string {
  return ISO_WEEKDAYS.find((d) => d.dayOfWeek === dayOfWeek)?.label ?? `Day ${dayOfWeek}`;
}

export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeTimeString(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = TIME_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const hh = match[1];
  const mm = match[2];
  const ss = match[3] ?? "00";
  return `${hh}:${mm}:${ss}`;
}

export function timeToMinutes(value: string): number {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) {
    return -1;
  }
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = Number(match[3] ?? "0");
  return hh * 60 + mm + ss / 60;
}

const optionalNullableTime = () =>
  z.preprocess(
    (val) => {
      if (val === "" || val === null || val === undefined) {
        return null;
      }
      return typeof val === "string" ? val.trim() : val;
    },
    z
      .string()
      .regex(TIME_PATTERN, "Time must be HH:MM or HH:MM:SS")
      .transform((v) => normalizeTimeString(v) ?? v)
      .nullable()
      .optional(),
  );

const optionalNullableInt = () =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) {
      return null;
    }
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  }, z.number().int().positive().nullable().optional());

export const scheduleDetailInputSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  isRestDay: z.boolean().default(false),
  startTime: optionalNullableTime(),
  endTime: optionalNullableTime(),
  tardyStart: optionalNullableTime(),
  undertimeStart: optionalNullableTime(),
  earlyDismissalStart: optionalNullableTime(),
});

export type ScheduleDetailInput = z.infer<typeof scheduleDetailInputSchema>;

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export function validateScheduleDetails(details: ScheduleDetailInput[]): string | null {
  const byDay = new Map<number, ScheduleDetailInput[]>();
  for (const slot of details) {
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push(slot);
    byDay.set(slot.dayOfWeek, list);
  }

  for (let day = 1; day <= 7; day++) {
    const daySlots = byDay.get(day);
    if (!daySlots || daySlots.length === 0) {
      return `Schedule must include at least one entry for ${getWeekdayLabel(day)}`;
    }
    const hasRest = daySlots.some((s) => s.isRestDay);
    if (hasRest) {
      if (daySlots.length > 1) {
        return `${getWeekdayLabel(day)} is marked as a rest day and cannot have additional shift slots`;
      }
      const restSlot = daySlots[0];
      if (
        restSlot?.startTime ||
        restSlot?.endTime ||
        restSlot?.tardyStart ||
        restSlot?.undertimeStart ||
        restSlot?.earlyDismissalStart
      ) {
        return `Rest day (${getWeekdayLabel(day)}) must not define shift or cutoff times`;
      }
    }
  }

  interface WeeklyInterval {
    start: number;
    end: number;
    dayOfWeek: number;
  }

  const intervals: WeeklyInterval[] = [];
  const seenDayStarts = new Set<string>();

  for (const slot of details) {
    if (slot.isRestDay) {
      continue;
    }
    if (!slot.startTime || !slot.endTime) {
      return `Working shift on ${getWeekdayLabel(slot.dayOfWeek)} requires both start and end times`;
    }
    const startMin = timeToMinutes(slot.startTime);
    const endMin = timeToMinutes(slot.endTime);
    if (startMin < 0 || endMin < 0) {
      return `Invalid time value on ${getWeekdayLabel(slot.dayOfWeek)}`;
    }
    if (startMin === endMin) {
      return `Shift start and end times cannot be equal on ${getWeekdayLabel(slot.dayOfWeek)}`;
    }

    const startKey = `${slot.dayOfWeek}:${slot.startTime}`;
    if (seenDayStarts.has(startKey)) {
      return `Duplicate shift start time on ${getWeekdayLabel(slot.dayOfWeek)}`;
    }
    seenDayStarts.add(startKey);

    const dayOffset = (slot.dayOfWeek - 1) * MINUTES_PER_DAY;
    const duration = endMin > startMin ? endMin - startMin : MINUTES_PER_DAY - startMin + endMin;
    const absStart = dayOffset + startMin;
    const absEnd = absStart + duration;

    if (absEnd <= MINUTES_PER_WEEK) {
      intervals.push({ start: absStart, end: absEnd, dayOfWeek: slot.dayOfWeek });
    } else {
      intervals.push({ start: absStart, end: MINUTES_PER_WEEK, dayOfWeek: slot.dayOfWeek });
      intervals.push({ start: 0, end: absEnd - MINUTES_PER_WEEK, dayOfWeek: slot.dayOfWeek });
    }
  }

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);

  for (let i = 1; i < intervals.length; i++) {
    const prev = intervals[i - 1];
    const curr = intervals[i];
    if (prev && curr && prev.end > curr.start) {
      if (prev.dayOfWeek === curr.dayOfWeek) {
        return `Overlapping shifts detected on ${getWeekdayLabel(prev.dayOfWeek)}`;
      }
      return `Overlapping shift detected between ${getWeekdayLabel(prev.dayOfWeek)} and ${getWeekdayLabel(curr.dayOfWeek)}`;
    }
  }

  return null;
}

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .max(50)
  .refine(isValidIanaTimezone, "Invalid IANA timezone");

export const createScheduleSchema = z
  .object({
    name: z.string().trim().min(1, "Schedule name is required").max(100),
    timezone: timezoneSchema.default("Asia/Manila"),
    attendancePolicyId: optionalNullableInt(),
    isActive: z.boolean().default(true),
    details: z.array(scheduleDetailInputSchema).min(7, "All 7 weekdays must be configured"),
  })
  .superRefine((data, ctx) => {
    const err = validateScheduleDetails(data.details);
    if (err) {
      ctx.addIssue({
        code: "custom",
        message: err,
        path: ["details"],
      });
    }
  });

export const updateScheduleSchema = z
  .object({
    name: z.string().trim().min(1, "Schedule name is required").max(100).optional(),
    timezone: timezoneSchema.optional(),
    attendancePolicyId: optionalNullableInt(),
    isActive: z.boolean().optional(),
    details: z.array(scheduleDetailInputSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.details !== undefined) {
      const err = validateScheduleDetails(data.details);
      if (err) {
        ctx.addIssue({
          code: "custom",
          message: err,
          path: ["details"],
        });
      }
    }
  });

export const scheduleIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const dateOnlyOptional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().regex(DATE_PATTERN, "Date must be YYYY-MM-DD").optional(),
);

const dateOnlyNullableOptional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(DATE_PATTERN, "Date must be YYYY-MM-DD").nullable().optional(),
);

export const listSchedulesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  timezone: z.string().trim().optional(),
  createdFrom: dateOnlyOptional,
  createdTo: dateOnlyOptional,
  sortBy: z.enum(["createdAt", "name", "timezone", "isActive"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const batchAssignScheduleSchema = z
  .object({
    scheduleId: z.coerce.number().int().positive("Schedule template is required"),
    employeeIds: z
      .array(z.string().trim().min(1).max(30))
      .min(1, "Select at least one employee")
      .max(100, "At most 100 employees can be assigned per batch")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Employee list must not contain duplicates",
      ),
    effectiveFrom: z.string().regex(DATE_PATTERN, "Effective from must be YYYY-MM-DD"),
    effectiveTo: dateOnlyNullableOptional,
  })
  .refine((data) => !data.effectiveTo || data.effectiveTo >= data.effectiveFrom, {
    message: "Effective to date must be on or after effective from date",
    path: ["effectiveTo"],
  });

export const updateEmployeeScheduleSchema = z.object({
  effectiveTo: z.preprocess(
    (v) => (v === "" || v === null ? null : v),
    z.string().regex(DATE_PATTERN, "Effective to must be YYYY-MM-DD").nullable(),
  ),
});

export const listEmployeeSchedulesQuerySchema = paginationQuerySchema.extend({
  employeeId: z.string().trim().optional(),
  scheduleId: z.coerce.number().int().positive().optional(),
  status: z.enum(["all", "current", "history_or_upcoming"]).default("all"),
  effectiveFrom: dateOnlyOptional,
  sortBy: z.enum(["effectiveFrom", "effectiveTo", "createdAt"]).default("effectiveFrom"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const employeeIdScheduleParamSchema = z.object({
  employeeId: z.string().trim().min(1).max(30),
});

export const resolveScheduleQuerySchema = z
  .object({
    from: z.string().regex(DATE_PATTERN, "From date must be YYYY-MM-DD"),
    to: z.string().regex(DATE_PATTERN, "To date must be YYYY-MM-DD"),
  })
  .superRefine((data, ctx) => {
    if (data.to < data.from) {
      ctx.addIssue({
        code: "custom",
        message: "End date must be on or after start date",
        path: ["to"],
      });
      return;
    }
    const startMs = Date.parse(`${data.from}T00:00:00Z`);
    const endMs = Date.parse(`${data.to}T00:00:00Z`);
    const days = Math.floor((endMs - startMs) / 86_400_000) + 1;
    if (days > 366) {
      ctx.addIssue({
        code: "custom",
        message: "Resolution range cannot exceed 366 calendar days",
        path: ["to"],
      });
    }
  });

export type CreateScheduleDto = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;
export type BatchAssignScheduleDto = z.infer<typeof batchAssignScheduleSchema>;
export type UpdateEmployeeScheduleDto = z.infer<typeof updateEmployeeScheduleSchema>;
export type ListEmployeeSchedulesQuery = z.infer<typeof listEmployeeSchedulesQuerySchema>;
export type ResolveScheduleQuery = z.infer<typeof resolveScheduleQuerySchema>;

export interface ScheduleDetailRecord {
  id: number;
  scheduleId: number;
  dayOfWeek: number;
  codeDay: string;
  isRestDay: boolean;
  startTime: string | null;
  endTime: string | null;
  tardyStart: string | null;
  undertimeStart: string | null;
  earlyDismissalStart: string | null;
}

export interface ScheduleRecord {
  id: number;
  name: string;
  timezone: string;
  attendancePolicyId: number | null;
  attendancePolicyName: string | null;
  isActive: boolean;
  workingDaysCount: number;
  assignmentCount: number;
  isLocked: boolean;
  details: ScheduleDetailRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeScheduleRecord {
  id: number;
  employeeId: string;
  employeeName: string;
  scheduleId: number;
  scheduleName: string;
  scheduleTimezone: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedBy: string | null;
  assignedByName: string | null;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedShiftSlot {
  startTime: string;
  endTime: string;
  isOvernight: boolean;
  startsAt: string;
  endsAt: string;
  tardyStart: string | null;
  undertimeStart: string | null;
  earlyDismissalStart: string | null;
  durationMinutes: number;
}

export interface ResolvedScheduleDay {
  date: string;
  dayOfWeek: number;
  codeDay: string;
  status: "unassigned" | "rest_day" | "working";
  scheduleId: number | null;
  scheduleName: string | null;
  timezone: string | null;
  attendancePolicyId: number | null;
  totalScheduledMinutes: number;
  slots: ResolvedShiftSlot[];
}

export interface ResolvedScheduleResponse {
  employeeId: string;
  from: string;
  to: string;
  days: ResolvedScheduleDay[];
}
