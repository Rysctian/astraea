import { z } from "zod";
import type { ApplicationApprovalStepRecord, ApprovalStatus } from "./approvals.js";
import { normalizeOvertimeTime, parseTimeToSeconds } from "./overtime.js";
import { paginationQuerySchema } from "./pagination.js";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const OB_TYPES = ["ob", "wfh"] as const;
export type ObType = (typeof OB_TYPES)[number];

export const officialBusinessDetailInputSchema = z
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
    }
  });

export type OfficialBusinessDetailInput = z.infer<typeof officialBusinessDetailInputSchema>;

/**
 * Strict schema enforces OB destination rules, positive windows, intra-submission
 * non-overlap, and rejects client-supplied status/submittedAt (Rule 7).
 */
export const createOfficialBusinessApplicationSchema = z
  .object({
    employeeIds: z
      .array(z.string().trim().min(1).max(30))
      .min(1, "Select at least one employee")
      .max(500, "Cannot file for more than 500 employees at once")
      .optional(),
    obType: z.enum(OB_TYPES).default("ob"),
    destination: z
      .string()
      .trim()
      .max(255, "Destination cannot exceed 255 characters")
      .nullable()
      .optional(),
    reason: z
      .string()
      .trim()
      .min(1, "Purpose / reason is required")
      .max(5000, "Purpose cannot exceed 5,000 characters"),
    autoApprove: z.boolean().default(false),
    details: z
      .array(officialBusinessDetailInputSchema)
      .min(1, "Add at least one schedule window")
      .max(100, "Maximum of 100 schedule rows per submission"),
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

    const cleanedDest = (data.destination ?? "").trim();
    if (data.obType === "ob" && cleanedDest.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destination"],
        message: "Destination is required for Official Business (OB) requests",
      });
    }

    // Intra-application non-overlap check per date (split non-overlapping windows allowed)
    const byDate = new Map<string, Array<{ index: number; startSec: number; endSec: number }>>();
    data.details.forEach((slot, index) => {
      const list = byDate.get(slot.date) ?? [];
      list.push({
        index,
        startSec: parseTimeToSeconds(slot.startTime),
        endSec: parseTimeToSeconds(slot.endTime),
      });
      byDate.set(slot.date, list);
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
            message: `Schedule window overlaps another slot on ${date}`,
          });
        }
      }
    }
  });

export type CreateOfficialBusinessApplicationDto = z.infer<
  typeof createOfficialBusinessApplicationSchema
>;

export const listOfficialBusinessApplicationsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  obTypes: z.string().trim().max(40).optional(),
  statuses: z.string().trim().max(80).optional(),
  submittedFrom: z.string().regex(DATE_REGEX).optional(),
  submittedTo: z.string().regex(DATE_REGEX).optional(),
  sortBy: z.enum(["submittedAt", "employeeName", "obType", "status"]).default("submittedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListOfficialBusinessApplicationsQuery = z.infer<
  typeof listOfficialBusinessApplicationsQuerySchema
>;

export const officialBusinessIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type OfficialBusinessIdParam = z.infer<typeof officialBusinessIdParamSchema>;

export interface OfficialBusinessDetailRecord {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
}

export interface OfficialBusinessApplicationRecord {
  id: number;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string | null;
  employeePosition: string | null;
  filedByUserId: string | null;
  filedByName: string | null;
  obType: ObType;
  destination: string | null;
  reason: string;
  status: ApprovalStatus;
  autoApproved: boolean;
  decisionRemarks: string | null;
  submittedAt: string;
  slotCount: number;
  details: OfficialBusinessDetailRecord[];
  approvals: ApplicationApprovalStepRecord[];
  canApprove: boolean;
  canDisapprove: boolean;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOfficialBusinessBatchResult {
  createdCount: number;
  applications: OfficialBusinessApplicationRecord[];
}

export interface OfficialBusinessFilingContext {
  currentEmployee: {
    employeeId: string;
    fullName: string;
    department: string | null;
    position: string | null;
  } | null;
}
