import { z } from "zod";
import type { ApplicationApprovalStepRecord, ApprovalStatus } from "./approvals.js";
import { paginationQuerySchema } from "./pagination.js";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const LEAVE_ACCRUAL_MODES = ["upfront_annual", "monthly_accrual", "none"] as const;
export type LeaveAccrualMode = (typeof LEAVE_ACCRUAL_MODES)[number];

export const LEAVE_DURATION_TYPES = ["whole_day", "half_day_am", "half_day_pm"] as const;
export type LeaveDurationType = (typeof LEAVE_DURATION_TYPES)[number];

export const LEAVE_CREDIT_CHANGE_TYPES = [
  "grant",
  "adjustment",
  "reserve",
  "deduct",
  "release",
  "restore",
] as const;
export type LeaveCreditChangeType = (typeof LEAVE_CREDIT_CHANGE_TYPES)[number];

export const LEAVE_ATTACHMENT_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "doc",
  "docx",
  "xls",
  "xlsx",
] as const;

export const LEAVE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function durationTypeToDayValue(durationType: LeaveDurationType): number {
  return durationType === "whole_day" ? 1 : 0.5;
}

export function roundCreditValue(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatCreditDecimal(value: number): string {
  return roundCreditValue(value).toFixed(2);
}

// --- Leave Policies ---

const leavePolicyBaseSchema = z.object({
  name: z.string().trim().min(1, "Policy name is required").max(100),
  description: z.string().trim().max(255).nullable().optional(),
  minNoticeDays: z.coerce.number().int().min(0).max(365).default(0),
  allowBackdatedFiling: z.boolean().default(false),
  maxBackdatedDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  maxConsecutiveDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  allowHalfDay: z.boolean().default(true),
  accrualMode: z.enum(LEAVE_ACCRUAL_MODES).default("upfront_annual"),
  allowNegativeBalance: z.boolean().default(false),
  carryOverEnabled: z.boolean().default(false),
  carryOverMaxDays: z.coerce.number().min(0).max(999).default(0),
  countRestDays: z.boolean().default(false),
  allowAttachments: z.boolean().default(false),
  requireAttachment: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

function refineLeavePolicy(
  data: z.infer<typeof leavePolicyBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  if (data.requireAttachment && !data.allowAttachments) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requireAttachment"],
      message: "Attachments must be enabled before making them required",
    });
  }
  if (data.isDefault && !data.isActive) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["isActive"],
      message: "Default leave policy must remain active",
    });
  }
}

export const createLeavePolicySchema = leavePolicyBaseSchema.superRefine(refineLeavePolicy);
export const updateLeavePolicySchema = leavePolicyBaseSchema.superRefine(refineLeavePolicy);

export type CreateLeavePolicyDto = z.infer<typeof createLeavePolicySchema>;
export type UpdateLeavePolicyDto = z.infer<typeof updateLeavePolicySchema>;

export const listLeavePoliciesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  sortBy: z.enum(["name", "minNoticeDays", "isDefault", "updatedAt"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type ListLeavePoliciesQuery = z.infer<typeof listLeavePoliciesQuerySchema>;

// --- Leave Types ---

export const createLeaveTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Leave code is required")
    .max(20)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Leave type name is required").max(100),
  description: z.string().trim().max(255).nullable().optional(),
  leavePolicyId: z.coerce.number().int().positive().nullable().optional(),
  isPaid: z.boolean().default(true),
  requiresCredits: z.boolean().default(true),
  defaultCredits: z.coerce.number().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema;

export type CreateLeaveTypeDto = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeDto = z.infer<typeof updateLeaveTypeSchema>;

export const listLeaveTypesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  sortBy: z.enum(["code", "name", "defaultCredits", "updatedAt"]).default("code"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type ListLeaveTypesQuery = z.infer<typeof listLeaveTypesQuerySchema>;

// --- Employee Leave Credits ---

export const upsertLeaveCreditSchema = z.object({
  employeeId: z.string().trim().min(1, "Employee is required").max(30),
  leaveTypeId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(2000).max(2100),
  allocatedCredits: z.coerce.number().min(0, "Allocated credits cannot be negative").max(999),
  remarks: z.string().trim().max(255).optional(),
});

export type UpsertLeaveCreditDto = z.infer<typeof upsertLeaveCreditSchema>;

export const bulkAllocateLeaveCreditsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  leaveTypeId: z.coerce.number().int().positive().optional(),
  employeeIds: z.array(z.string().trim().min(1).max(30)).max(500).optional(),
  allocatedCredits: z.coerce.number().min(0).max(999).optional(),
  overwriteExisting: z.boolean().default(false),
  remarks: z.string().trim().max(255).optional(),
});

export type BulkAllocateLeaveCreditsDto = z.infer<typeof bulkAllocateLeaveCreditsSchema>;

export const listLeaveCreditsQuerySchema = paginationQuerySchema.extend({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  leaveTypeId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z
    .enum(["employeeName", "leaveTypeCode", "allocatedCredits", "availableCredits"])
    .default("employeeName"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type ListLeaveCreditsQuery = z.infer<typeof listLeaveCreditsQuerySchema>;

export const myLeaveCreditsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type MyLeaveCreditsQuery = z.infer<typeof myLeaveCreditsQuerySchema>;

// --- Leave Applications ---

export const leaveApplicationDetailInputSchema = z
  .object({
    date: z.string().regex(DATE_REGEX, "Date must be YYYY-MM-DD"),
    durationType: z.enum(LEAVE_DURATION_TYPES).default("whole_day"),
  })
  .strict();

export type LeaveApplicationDetailInput = z.infer<typeof leaveApplicationDetailInputSchema>;

/**
 * Strict schema enforces single-employee filing and rejects server-controlled fields.
 */
export const createLeaveApplicationSchema = z
  .object({
    employeeId: z.string().trim().min(1).max(30).optional(),
    leaveTypeId: z.coerce.number().int().positive("Select a leave type"),
    reason: z
      .string()
      .trim()
      .min(1, "Reason is required")
      .max(5000, "Reason cannot exceed 5,000 characters"),
    autoApprove: z.boolean().default(false),
    details: z
      .array(leaveApplicationDetailInputSchema)
      .min(1, "Select at least one leave date")
      .max(120, "Maximum of 120 dates per leave request"),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.details.forEach((row, index) => {
      if (seen.has(row.date)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["details", index, "date"],
          message: `Duplicate date ${row.date} in leave request`,
        });
      }
      seen.add(row.date);
    });
  });

export type CreateLeaveApplicationDto = z.infer<typeof createLeaveApplicationSchema>;

export const listLeaveApplicationsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["all", "pending", "approved", "disapproved", "cancelled"]).default("all"),
  leaveTypeId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().regex(DATE_REGEX).optional(),
  dateTo: z.string().regex(DATE_REGEX).optional(),
  sortBy: z
    .enum(["submittedAt", "employeeName", "dateFrom", "totalDays", "status"])
    .default("submittedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListLeaveApplicationsQuery = z.infer<typeof listLeaveApplicationsQuerySchema>;

export const leaveIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type LeaveIdParam = z.infer<typeof leaveIdParamSchema>;

// --- Response Records ---

export interface LeavePolicyRecord {
  id: number;
  name: string;
  description: string | null;
  minNoticeDays: number;
  allowBackdatedFiling: boolean;
  maxBackdatedDays: number | null;
  maxConsecutiveDays: number | null;
  allowHalfDay: boolean;
  accrualMode: LeaveAccrualMode;
  allowNegativeBalance: boolean;
  carryOverEnabled: boolean;
  carryOverMaxDays: number;
  countRestDays: boolean;
  allowAttachments: boolean;
  requireAttachment: boolean;
  isDefault: boolean;
  isActive: boolean;
  assignedLeaveTypeCount: number;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveTypeRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  leavePolicyId: number | null;
  leavePolicyName: string | null;
  isPaid: boolean;
  requiresCredits: boolean;
  defaultCredits: number;
  isActive: boolean;
  creditCount: number;
  applicationCount: number;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveTypeOptionWithPolicy {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isPaid: boolean;
  requiresCredits: boolean;
  defaultCredits: number;
  effectivePolicy: {
    id: number;
    name: string;
    minNoticeDays: number;
    allowBackdatedFiling: boolean;
    maxBackdatedDays: number | null;
    maxConsecutiveDays: number | null;
    allowHalfDay: boolean;
    allowNegativeBalance: boolean;
    countRestDays: boolean;
    allowAttachments: boolean;
    requireAttachment: boolean;
  } | null;
}

export interface LeaveFilingOptionsResponse {
  currentEmployee: {
    employeeId: string;
    fullName: string;
    department: string | null;
    position: string | null;
  } | null;
  leaveTypes: LeaveTypeOptionWithPolicy[];
}

export interface EmployeeLeaveCreditRecord {
  id: number;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string | null;
  leaveTypeId: number;
  leaveTypeCode: string;
  leaveTypeName: string;
  isPaid: boolean;
  year: number;
  allocatedCredits: number;
  usedCredits: number;
  pendingCredits: number;
  availableCredits: number;
  updatedAt: string;
}

export interface LeaveCreditLogRecord {
  id: number;
  employeeLeaveCreditId: number;
  changeType: LeaveCreditChangeType;
  amount: number;
  balanceAfter: number;
  leaveApplicationId: number | null;
  remarks: string | null;
  actedBy: string | null;
  actedByName: string | null;
  createdAt: string;
}

export interface BulkAllocateCreditsResult {
  year: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}

export interface LeaveApplicationDetailRecord {
  id: number;
  date: string;
  durationType: LeaveDurationType;
  dayValue: number;
}

export interface LeaveApplicationRecord {
  id: number;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string | null;
  employeePosition: string | null;
  filedByUserId: string | null;
  filedByName: string | null;
  leaveTypeId: number;
  leaveTypeCode: string;
  leaveTypeName: string;
  isPaid: boolean;
  dateFrom: string;
  dateTo: string;
  totalDays: number;
  reason: string;
  hasAttachment: boolean;
  attachmentName: string | null;
  status: ApprovalStatus;
  autoApproved: boolean;
  decisionRemarks: string | null;
  submittedAt: string;
  details: LeaveApplicationDetailRecord[];
  approvals: ApplicationApprovalStepRecord[];
  canApprove: boolean;
  canDisapprove: boolean;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
}
