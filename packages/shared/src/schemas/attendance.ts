import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";
import { normalizeTimeString } from "./schedules.js";

export const ATTENDANCE_LOG_SOURCES = [
  "biometric",
  "manual",
  "excel_import",
  "correction",
] as const;
export type AttendanceLogSource = (typeof ATTENDANCE_LOG_SOURCES)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const optionalTime = () =>
  z.preprocess(
    (v) =>
      v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? v.trim() : v,
    z
      .string()
      .regex(TIME_PATTERN, "Time must be HH:MM or HH:MM:SS")
      .transform((t) => normalizeTimeString(t) ?? t)
      .optional(),
  );

const optionalNullableDevice = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().max(100).optional(),
);

export const createManualLogSchema = z
  .object({
    employeeId: z.string().trim().min(1, "Employee is required").max(30),
    deviceId: optionalNullableDevice,
    loggedAt: z.string().trim().optional(),
    date: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().regex(DATE_PATTERN, "Date must be YYYY-MM-DD").optional(),
    ),
    amIn: optionalTime(),
    amOut: optionalTime(),
    pmIn: optionalTime(),
    pmOut: optionalTime(),
  })
  .superRefine((data, ctx) => {
    const hasExact = Boolean(data.loggedAt && !Number.isNaN(Date.parse(data.loggedAt)));
    const hasSlots = Boolean(data.amIn || data.amOut || data.pmIn || data.pmOut);

    if (data.loggedAt && !hasExact) {
      ctx.addIssue({
        code: "custom",
        message: "loggedAt must be a valid ISO datetime string",
        path: ["loggedAt"],
      });
      return;
    }

    if (!hasExact && !hasSlots) {
      ctx.addIssue({
        code: "custom",
        message: "Provide at least one punch time (AM In, AM Out, PM In, or PM Out)",
        path: ["amIn"],
      });
    }

    if (hasSlots && !data.date) {
      ctx.addIssue({
        code: "custom",
        message: "Date is required when submitting AM/PM punch times",
        path: ["date"],
      });
    }
  });

const dateOnlyOptional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().regex(DATE_PATTERN, "Date must be YYYY-MM-DD").optional(),
);

export const listAttendanceLogsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  employeeId: z.string().trim().optional(),
  source: z.enum(["all", ...ATTENDANCE_LOG_SOURCES]).default("all"),
  dateFrom: dateOnlyOptional,
  dateTo: dateOnlyOptional,
  sortBy: z.enum(["loggedAt", "createdAt", "employeeId", "source"]).default("loggedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const dtrQuerySchema = z
  .object({
    employeeId: z.string().trim().min(1, "Employee is required").max(30),
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
        message: "DTR date range cannot exceed 366 calendar days",
        path: ["to"],
      });
    }
  });

export type CreateManualLogDto = z.infer<typeof createManualLogSchema>;
export type ListAttendanceLogsQuery = z.infer<typeof listAttendanceLogsQuerySchema>;
export type DtrQuery = z.infer<typeof dtrQuerySchema>;

export interface AttendanceLogRecord {
  id: number;
  employeeId: string;
  employeeName: string;
  loggedAt: string;
  deviceId: string | null;
  source: AttendanceLogSource;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ManualLogResult {
  insertedCount: number;
  skippedCount: number;
  records: AttendanceLogRecord[];
}

export interface ImportLogsRowError {
  row: number;
  message: string;
}

export interface ImportLogsResult {
  totalRows: number;
  insertedCount: number;
  skippedCount: number;
}

export type DtrRowStatus = "present" | "absent" | "late_or_undertime" | "rest_day" | "no_schedule";

export interface DtrRowRecord {
  date: string;
  dayOfWeek: number;
  codeDay: string;
  scheduleId: number | null;
  scheduleName: string | null;
  timezone: string | null;
  slotIndex: number;
  schedStart: string | null;
  schedEnd: string | null;
  isOvernight: boolean;
  timeIn: string | null;
  timeOut: string | null;
  scheduledSeconds: number;
  renderedSeconds: number;
  tardySeconds: number;
  undertimeSeconds: number;
  absent: boolean;
  undertime: boolean;
  earlyDismiss: boolean;
  status: DtrRowStatus;
  remarks: string;
}

export interface DtrSummaryMetrics {
  totalRenderedSeconds: number;
  totalScheduledSeconds: number;
  presentDays: number;
  absentDays: number;
  totalTardySeconds: number;
  totalUndertimeSeconds: number;
}

export interface DtrResponse {
  employeeId: string;
  employeeName: string;
  from: string;
  to: string;
  summary: DtrSummaryMetrics;
  rows: DtrRowRecord[];
}
