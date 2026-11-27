import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";
import { normalizeTimeString } from "./schedules.js";

export const CUT_OFF_SCHEDULE_TYPES = ["monthly", "semi_monthly"] as const;
export type CutOffScheduleType = (typeof CUT_OFF_SCHEDULE_TYPES)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const optionalNullableDate = () =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.string().regex(DATE_PATTERN, "Date must be YYYY-MM-DD").nullable().optional(),
  );

const optionalNullableTime = () =>
  z.preprocess(
    (v) =>
      v === "" || v === null || v === undefined ? null : typeof v === "string" ? v.trim() : v,
    z
      .string()
      .regex(TIME_PATTERN, "Time must be HH:MM or HH:MM:SS")
      .transform((t) => normalizeTimeString(t) ?? t)
      .nullable()
      .optional(),
  );

const requiredDate = (label: string) =>
  z.string().regex(DATE_PATTERN, `${label} must be YYYY-MM-DD`);

export const cutOffPeriodInputSchema = z
  .object({
    cutOffNo: z.coerce.number().int().min(1).max(2),
    noDtr: z.boolean().default(false),
    dtrDateFrom: optionalNullableDate(),
    dtrDateTo: optionalNullableDate(),
    confirmationStartDate: optionalNullableDate(),
    confirmationEndDate: optionalNullableDate(),
    confirmationTimeFrom: optionalNullableTime(),
    confirmationTimeTo: optionalNullableTime(),
    payrollDateFrom: requiredDate("Payroll start date"),
    payrollDateTo: requiredDate("Payroll end date"),
    releaseDate: requiredDate("Release date"),
  })
  .strict()
  .superRefine((period, ctx) => {
    if (period.payrollDateTo < period.payrollDateFrom) {
      ctx.addIssue({
        code: "custom",
        message: "Payroll end date must be on or after payroll start date",
        path: ["payrollDateTo"],
      });
    }
    if (period.releaseDate < period.payrollDateTo) {
      ctx.addIssue({
        code: "custom",
        message: "Release date must be on or after payroll end date",
        path: ["releaseDate"],
      });
    }

    if (period.noDtr) {
      return;
    }

    if (!period.dtrDateFrom) {
      ctx.addIssue({
        code: "custom",
        message: "DTR start date is required",
        path: ["dtrDateFrom"],
      });
    }
    if (!period.dtrDateTo) {
      ctx.addIssue({ code: "custom", message: "DTR end date is required", path: ["dtrDateTo"] });
    }
    if (period.dtrDateFrom && period.dtrDateTo && period.dtrDateTo < period.dtrDateFrom) {
      ctx.addIssue({
        code: "custom",
        message: "DTR end date must be on or after DTR start date",
        path: ["dtrDateTo"],
      });
    }

    if (!period.confirmationStartDate) {
      ctx.addIssue({
        code: "custom",
        message: "Confirmation start date is required",
        path: ["confirmationStartDate"],
      });
    }
    if (!period.confirmationEndDate) {
      ctx.addIssue({
        code: "custom",
        message: "Confirmation end date is required",
        path: ["confirmationEndDate"],
      });
    }
    if (!period.confirmationTimeFrom) {
      ctx.addIssue({
        code: "custom",
        message: "Confirmation start time is required",
        path: ["confirmationTimeFrom"],
      });
    }
    if (!period.confirmationTimeTo) {
      ctx.addIssue({
        code: "custom",
        message: "Confirmation end time is required",
        path: ["confirmationTimeTo"],
      });
    }

    if (
      period.confirmationStartDate &&
      period.confirmationEndDate &&
      period.confirmationEndDate < period.confirmationStartDate
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Confirmation end date must be on or after start date",
        path: ["confirmationEndDate"],
      });
      return;
    }

    if (
      period.confirmationStartDate &&
      period.confirmationEndDate &&
      period.confirmationTimeFrom &&
      period.confirmationTimeTo
    ) {
      const startDt = `${period.confirmationStartDate}T${period.confirmationTimeFrom}`;
      const endDt = `${period.confirmationEndDate}T${period.confirmationTimeTo}`;
      if (endDt < startDt) {
        ctx.addIssue({
          code: "custom",
          message: "Confirmation end date & time must be on or after start date & time",
          path: ["confirmationTimeTo"],
        });
      }
    }
  });

export type CutOffPeriodInput = z.infer<typeof cutOffPeriodInputSchema>;

export function normalizeCutOffPeriod(period: CutOffPeriodInput): CutOffPeriodInput {
  if (period.noDtr) {
    return {
      cutOffNo: period.cutOffNo,
      noDtr: true,
      dtrDateFrom: null,
      dtrDateTo: null,
      confirmationStartDate: null,
      confirmationEndDate: null,
      confirmationTimeFrom: null,
      confirmationTimeTo: null,
      payrollDateFrom: period.payrollDateFrom,
      payrollDateTo: period.payrollDateTo,
      releaseDate: period.releaseDate,
    };
  }
  return {
    ...period,
    dtrDateFrom: period.dtrDateFrom ?? null,
    dtrDateTo: period.dtrDateTo ?? null,
    confirmationStartDate: period.confirmationStartDate ?? null,
    confirmationEndDate: period.confirmationEndDate ?? null,
    confirmationTimeFrom: normalizeTimeString(period.confirmationTimeFrom),
    confirmationTimeTo: normalizeTimeString(period.confirmationTimeTo),
  };
}

const cutOffBodyBaseSchema = z.object({
  scheduleType: z.enum(CUT_OFF_SCHEDULE_TYPES),
  name: z.string().trim().min(1, "Cut-off name is required").max(100),
  year: z.coerce.number().int().min(1900, "Year must be >= 1900").max(9999, "Year must be <= 9999"),
  month: z.coerce.number().int().min(1, "Month must be 1–12").max(12, "Month must be 1–12"),
  isActive: z.boolean().default(true),
  periods: z.array(cutOffPeriodInputSchema).min(1).max(2),
});

function validatePeriodCardinality(
  data: { scheduleType: CutOffScheduleType; periods: CutOffPeriodInput[] },
  ctx: z.RefinementCtx,
) {
  const nums = data.periods.map((p) => p.cutOffNo);
  const unique = new Set(nums);
  if (unique.size !== nums.length) {
    ctx.addIssue({
      code: "custom",
      message: "Cut-off period numbers must be distinct",
      path: ["periods"],
    });
    return;
  }

  if (data.scheduleType === "monthly") {
    if (nums.length !== 1 || !unique.has(1)) {
      ctx.addIssue({
        code: "custom",
        message: "Monthly cut-off must contain exactly one period (1st Cut-Off)",
        path: ["periods"],
      });
    }
  } else {
    if (nums.length !== 2 || !unique.has(1) || !unique.has(2)) {
      ctx.addIssue({
        code: "custom",
        message: "Semi-monthly cut-off must contain both 1st and 2nd Cut-Off periods",
        path: ["periods"],
      });
    }
  }
}

export const createCutOffSchema = cutOffBodyBaseSchema.superRefine(validatePeriodCardinality);
export const updateCutOffSchema = cutOffBodyBaseSchema.superRefine(validatePeriodCardinality);

export const cutOffIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const dateOnlyOptional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().regex(DATE_PATTERN, "Date must be YYYY-MM-DD").optional(),
);

const optionalIntFilter = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(min).max(max).optional(),
  );

export const listCutOffsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  scheduleType: z.enum(["all", ...CUT_OFF_SCHEDULE_TYPES]).default("all"),
  month: optionalIntFilter(1, 12),
  year: optionalIntFilter(1900, 9999),
  isActive: z.enum(["all", "true", "false"]).default("all"),
  createdFrom: dateOnlyOptional,
  createdTo: dateOnlyOptional,
  sortBy: z
    .enum(["createdAt", "name", "year", "month", "scheduleType", "isActive"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const cutOffPresetsQuerySchema = z.object({
  scheduleType: z.enum(CUT_OFF_SCHEDULE_TYPES).optional(),
});

export type CreateCutOffDto = z.infer<typeof createCutOffSchema>;
export type UpdateCutOffDto = z.infer<typeof updateCutOffSchema>;
export type ListCutOffsQuery = z.infer<typeof listCutOffsQuerySchema>;
export type CutOffPresetsQuery = z.infer<typeof cutOffPresetsQuerySchema>;

export interface CutOffPeriodRecord {
  id: number;
  cutOffId: number;
  cutOffNo: number;
  dtrDateFrom: string | null;
  dtrDateTo: string | null;
  noDtr: boolean;
  confirmationStartDate: string | null;
  confirmationEndDate: string | null;
  confirmationTimeFrom: string | null;
  confirmationTimeTo: string | null;
  payrollDateFrom: string;
  payrollDateTo: string;
  releaseDate: string;
}

export interface CutOffRecord {
  id: number;
  scheduleType: CutOffScheduleType;
  name: string;
  year: number;
  month: number;
  isActive: boolean;
  periods: CutOffPeriodRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface CutOffPresetItem {
  cutOffId: number;
  cutOffName: string;
  scheduleType: CutOffScheduleType;
  year: number;
  month: number;
  periodId: number;
  cutOffNo: number;
  noDtr: boolean;
  presetDateFrom: string;
  presetDateTo: string;
  payrollDateFrom: string;
  payrollDateTo: string;
  releaseDate: string;
}
