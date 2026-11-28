import { z } from "zod";
import type { ApplicationApprovalStepRecord, ApprovalStatus } from "./approvals.js";
import { paginationQuerySchema } from "./pagination.js";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function parseTimeToSeconds(raw: string): number {
  const parts = raw.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return h * 3600 + m * 60 + s;
}

export function normalizeOvertimeTime(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }
  return trimmed;
}

export const overtimeDetailInputSchema = z
  .object({
    date: z.string().regex(DATE_REGEX, "Date must be YYYY-MM-DD"),
    startTime: z
      .string()
      .regex(TIME_REGEX, "Start time must be HH:MM or HH:MM:SS")
      .transform(normalizeOvertimeTime),
    endTime: z
      .string()
      .regex(TIME_REGEX, "End time must be HH:MM or HH:MM:SS")
      .transform(normalizeOvertimeTime),
    breakSeconds: z.coerce.number().int().min(0, "Break cannot be negative").default(0),
  })
  .strict()
  .superRefine((slot, ctx) => {
    const startSec = parseTimeToSeconds(slot.startTime);
    const endSec = parseTimeToSeconds(slot.endTime);
    if (endSec <= startSec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "End time must be strictly after start time",
      });
      return;
    }
    const gross = endSec - startSec;
    if (slot.breakSeconds >= gross) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakSeconds"],
        message: "Break deduction must be strictly shorter than the gross slot duration",
      });
    }
  });

export type OvertimeDetailInput = z.infer<typeof overtimeDetailInputSchema>;

/**
 * Strict schema intentionally rejects client-supplied status or submittedAt (Rule 7).
 */
export const createOvertimeApplicationSchema = z
  .object({
    employeeIds: z
      .array(z.string().trim().min(1).max(30))
      .min(1, "Select at least one employee")
      .max(500, "Cannot file for more than 500 employees at once")
      .optional(),
    reason: z
      .string()
      .trim()
      .min(1, "Reason is required")
      .max(5000, "Reason cannot exceed 5,000 characters"),
    autoApprove: z.boolean().default(false),
    details: z
      .array(overtimeDetailInputSchema)
      .min(1, "Add at least one overtime slot")
      .max(100, "Maximum of 100 overtime slots per submission"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.employeeIds) {
      const unique = new Set(data.employeeIds);
      if (unique.size !== data.employeeIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["employeeIds"],
          message: "Duplicate employee IDs in submission",
        });
      }
    }

    // Intra-submission non-overlap per date
    const byDate = new Map<string, Array<{ index: number; startSec: number; endSec: number }>>();
    data.details.forEach((slot, index) => {
      const arr = byDate.get(slot.date) ?? [];
      arr.push({
        index,
        startSec: parseTimeToSeconds(slot.startTime),
        endSec: parseTimeToSeconds(slot.endTime),
      });
      byDate.set(slot.date, arr);
    });

    for (const [date, slots] of byDate.entries()) {
      const sorted = [...slots].sort((a, b) => a.startSec - b.startSec);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (prev && curr && curr.startSec < prev.endSec) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["details", curr.index, "startTime"],
            message: `Overtime slot overlaps another slot on ${date}`,
          });
        }
      }
    }
  });

export type CreateOvertimeApplicationDto = z.infer<typeof createOvertimeApplicationSchema>;

export const listOvertimeApplicationsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["all", "pending", "approved", "disapproved", "cancelled"]).default("all"),
  submittedFrom: z.string().regex(DATE_REGEX).optional(),
  submittedTo: z.string().regex(DATE_REGEX).optional(),
  sortBy: z
    .enum(["submittedAt", "employeeName", "status", "totalRequestedSeconds"])
    .default("submittedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListOvertimeApplicationsQuery = z.infer<typeof listOvertimeApplicationsQuerySchema>;

export const overtimeApplicationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type OvertimeApplicationIdParam = z.infer<typeof overtimeApplicationIdParamSchema>;

export interface OvertimeDetailRecord {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  breakSeconds: number;
  requestedSeconds: number;
}

export interface OvertimeApplicationRecord {
  id: number;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string | null;
  employeePosition: string | null;
  filedByUserId: string | null;
  filedByName: string | null;
  reason: string;
  status: ApprovalStatus;
  autoApproved: boolean;
  decisionRemarks: string | null;
  submittedAt: string;
  totalRequestedSeconds: number;
  totalBreakSeconds: number;
  slotCount: number;
  details: OvertimeDetailRecord[];
  approvals: ApplicationApprovalStepRecord[];
  canApprove: boolean;
  canDisapprove: boolean;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOvertimeBatchResult {
  createdCount: number;
  applications: OvertimeApplicationRecord[];
}
