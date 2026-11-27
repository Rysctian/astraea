import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

export const TARDY_COUNT_FROM_VALUES = ["schedule_start", "after_grace"] as const;
export type TardyCountFrom = (typeof TARDY_COUNT_FROM_VALUES)[number];

const emptyToNullString = (val: unknown) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed === "" ? null : trimmed;
  }
  return val;
};

const optionalNullableInt = (min: number, max: number) =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) {
      return null;
    }
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  }, z.number().int().min(min).max(max).nullable().optional());

const attendancePolicyBaseSchema = z.object({
  name: z.string().trim().min(1, "Policy name is required").max(100),
  description: z.preprocess(emptyToNullString, z.string().max(255).nullable().optional()),
  tardyGraceSeconds: z.coerce.number().int().min(0).max(43200).default(0),
  tardyCountFrom: z.enum(TARDY_COUNT_FROM_VALUES).default("schedule_start"),
  absentAfterLateSeconds: optionalNullableInt(60, 86400),
  undertimeGraceSeconds: z.coerce.number().int().min(0).max(43200).default(0),
  earlyInWindowSeconds: z.coerce.number().int().min(0).max(43200).default(14400),
  lateOutWindowSeconds: z.coerce.number().int().min(0).max(43200).default(14400),
  duplicateTapWindowSeconds: z.coerce.number().int().min(0).max(3600).default(120),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const createAttendancePolicySchema = attendancePolicyBaseSchema.superRefine((data, ctx) => {
  if (
    data.absentAfterLateSeconds !== null &&
    data.absentAfterLateSeconds !== undefined &&
    data.absentAfterLateSeconds <= data.tardyGraceSeconds
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Mark absent after late must be strictly greater than tardy grace period",
      path: ["absentAfterLateSeconds"],
    });
  }
  if (data.isDefault && !data.isActive) {
    ctx.addIssue({
      code: "custom",
      message: "System default policy must be active",
      path: ["isDefault"],
    });
  }
});

export const updateAttendancePolicySchema = attendancePolicyBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    if (
      typeof data.absentAfterLateSeconds === "number" &&
      typeof data.tardyGraceSeconds === "number" &&
      data.absentAfterLateSeconds <= data.tardyGraceSeconds
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Mark absent after late must be strictly greater than tardy grace period",
        path: ["absentAfterLateSeconds"],
      });
    }
    if (data.isDefault === true && data.isActive === false) {
      ctx.addIssue({
        code: "custom",
        message: "System default policy must be active",
        path: ["isDefault"],
      });
    }
  });

export const attendancePolicyIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const dateOnlyOptional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
);

export const listAttendancePoliciesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  tardyCountFrom: z.enum(["all", ...TARDY_COUNT_FROM_VALUES]).default("all"),
  isDefault: z.enum(["all", "true", "false"]).default("all"),
  isActive: z.enum(["all", "true", "false"]).default("all"),
  createdFrom: dateOnlyOptional,
  createdTo: dateOnlyOptional,
  sortBy: z
    .enum([
      "createdAt",
      "name",
      "tardyGraceSeconds",
      "undertimeGraceSeconds",
      "absentAfterLateSeconds",
      "isDefault",
      "isActive",
    ])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateAttendancePolicyDto = z.infer<typeof createAttendancePolicySchema>;
export type UpdateAttendancePolicyDto = z.infer<typeof updateAttendancePolicySchema>;
export type ListAttendancePoliciesQuery = z.infer<typeof listAttendancePoliciesQuerySchema>;

export interface AttendancePolicyRecord {
  id: number;
  name: string;
  description: string | null;
  tardyGraceSeconds: number;
  tardyCountFrom: TardyCountFrom;
  absentAfterLateSeconds: number | null;
  undertimeGraceSeconds: number;
  earlyInWindowSeconds: number;
  lateOutWindowSeconds: number;
  duplicateTapWindowSeconds: number;
  isDefault: boolean;
  isActive: boolean;
  scheduleCount: number;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendancePolicyOption {
  id: number;
  name: string;
  isDefault: boolean;
  tardyGraceSeconds: number;
  tardyCountFrom: TardyCountFrom;
}

export interface AttendancePolicyOptionsResponse {
  defaultPolicyId: number | null;
  defaultPolicyName: string | null;
  items: AttendancePolicyOption[];
}
