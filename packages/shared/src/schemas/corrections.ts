import { z } from "zod";
import type { ApplicationApprovalStepRecord, ApprovalStatus } from "./approvals.js";
import { normalizeOvertimeTime, parseTimeToSeconds } from "./overtime.js";
import { paginationQuerySchema } from "./pagination.js";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const optionalTimeField = z
  .string()
  .nullable()
  .optional()
  .transform((val) => {
    if (val === null || val === undefined) return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    return trimmed;
  })
  .refine((val) => val === null || TIME_REGEX.test(val), {
    message: "Time must be HH:MM or HH:MM:SS",
  })
  .transform((val) => (val === null ? null : normalizeOvertimeTime(val)))
  .default(null);

export interface FourSlotPunches {
  amIn: string | null;
  amOut: string | null;
  pmIn: string | null;
  pmOut: string | null;
}

export const correctionDetailInputSchema = z
  .object({
    date: z.string().regex(DATE_REGEX, "Date must be YYYY-MM-DD"),
    amIn: optionalTimeField,
    amOut: optionalTimeField,
    pmIn: optionalTimeField,
    pmOut: optionalTimeField,
  })
  .strict()
  .superRefine((row, ctx) => {
    const hasAny =
      row.amIn !== null || row.amOut !== null || row.pmIn !== null || row.pmOut !== null;
    if (!hasAny) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amIn"],
        message: `At least one punch slot (AM In, AM Out, PM In, or PM Out) is required for ${row.date}`,
      });
      return;
    }

    const amInSec = row.amIn ? parseTimeToSeconds(row.amIn) : null;
    const amOutSec = row.amOut ? parseTimeToSeconds(row.amOut) : null;
    const pmInSec = row.pmIn ? parseTimeToSeconds(row.pmIn) : null;
    const pmOutSec = row.pmOut ? parseTimeToSeconds(row.pmOut) : null;

    if (amInSec !== null && amOutSec !== null && amOutSec <= amInSec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amOut"],
        message: `AM Out must be strictly later than AM In on ${row.date}`,
      });
    }

    if (pmInSec !== null && pmOutSec !== null && pmOutSec <= pmInSec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pmOut"],
        message: `PM Out must be strictly later than PM In on ${row.date}`,
      });
    }

    const latestAm = amOutSec ?? amInSec;
    const earliestPm = pmInSec ?? pmOutSec;
    if (latestAm !== null && earliestPm !== null && earliestPm < latestAm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [pmInSec !== null ? "pmIn" : "pmOut"],
        message: `PM punch cannot precede the latest AM punch on ${row.date}`,
      });
    }
  });

export type CorrectionDetailInput = z.infer<typeof correctionDetailInputSchema>;

/**
 * Strict schema enforces single-employee filing, unique dates, and rejects server-controlled fields.
 */
export const createCorrectionApplicationSchema = z
  .object({
    employeeId: z.string().trim().min(1).max(30).optional(),
    reason: z
      .string()
      .trim()
      .min(1, "Reason is required")
      .max(5000, "Reason cannot exceed 5,000 characters"),
    autoApprove: z.boolean().default(false),
    details: z
      .array(correctionDetailInputSchema)
      .min(1, "Add at least one date to correct")
      .max(100, "Maximum of 100 dates per correction request"),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.details.forEach((row, index) => {
      if (seen.has(row.date)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["details", index, "date"],
          message: `Duplicate calendar date ${row.date} in correction submission`,
        });
      }
      seen.add(row.date);
    });
  });

export type CreateCorrectionApplicationDto = z.infer<typeof createCorrectionApplicationSchema>;

export const previewCorrectionLogsQuerySchema = z.object({
  employeeId: z.string().trim().min(1).max(30).optional(),
  date: z.string().regex(DATE_REGEX, "Date must be YYYY-MM-DD"),
});

export type PreviewCorrectionLogsQuery = z.infer<typeof previewCorrectionLogsQuerySchema>;

export const listCorrectionApplicationsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  statuses: z.string().trim().max(80).optional(),
  submittedFrom: z.string().regex(DATE_REGEX).optional(),
  submittedTo: z.string().regex(DATE_REGEX).optional(),
  sortBy: z.enum(["submittedAt", "employeeName", "status"]).default("submittedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListCorrectionApplicationsQuery = z.infer<typeof listCorrectionApplicationsQuerySchema>;

export const correctionIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CorrectionIdParam = z.infer<typeof correctionIdParamSchema>;

export interface CorrectionPreviewLogItem {
  id: number;
  loggedAt: string;
  timeLocal: string;
  source: string;
  deviceId: string | null;
}

export interface CorrectionLogPreviewResponse {
  employeeId: string;
  date: string;
  timezone: string;
  logs: CorrectionPreviewLogItem[];
  paired: FourSlotPunches;
}

export interface CorrectionApplicationDetailRecord {
  id: number;
  date: string;
  oldAmIn: string | null;
  oldAmOut: string | null;
  oldPmIn: string | null;
  oldPmOut: string | null;
  amIn: string | null;
  amOut: string | null;
  pmIn: string | null;
  pmOut: string | null;
}

export interface CorrectionApplicationRecord {
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
  dateCount: number;
  details: CorrectionApplicationDetailRecord[];
  approvals: ApplicationApprovalStepRecord[];
  canApprove: boolean;
  canDisapprove: boolean;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CorrectionFilingContext {
  currentEmployee: {
    employeeId: string;
    fullName: string;
    department: string | null;
    position: string | null;
  } | null;
}
