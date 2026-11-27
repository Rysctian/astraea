import type {
  AttendancePolicyRecord,
  CreateAttendancePolicyDto,
  TardyCountFrom,
} from "@starter/shared";
import { z } from "zod";

export const policyDrawerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Policy name is required").max(100),
    description: z.string().max(255).optional().default(""),
    tardyGraceMinutes: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Min 0 min")
      .max(720, "Max 720 min"),
    tardyCountFrom: z.enum(["schedule_start", "after_grace"]).default("schedule_start"),
    absentAfterLateMinutes: z
      .string()
      .optional()
      .default("")
      .refine(
        (v) => {
          if (!v.trim()) return true;
          const n = Number(v);
          return Number.isInteger(n) && n >= 1 && n <= 1440;
        },
        { message: "Must be between 1 and 1440 minutes, or blank to disable" },
      ),
    undertimeGraceMinutes: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Min 0 min")
      .max(720, "Max 720 min"),
    earlyInWindowMinutes: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Min 0 min")
      .max(720, "Max 720 min"),
    lateOutWindowMinutes: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Min 0 min")
      .max(720, "Max 720 min"),
    duplicateTapWindowSeconds: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Min 0 sec")
      .max(3600, "Max 3600 sec"),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.absentAfterLateMinutes.trim()) {
      const absentSec = Number(data.absentAfterLateMinutes) * 60;
      const graceSec = data.tardyGraceMinutes * 60;
      if (absentSec <= graceSec) {
        ctx.addIssue({
          code: "custom",
          message: "Absent threshold must be strictly greater than tardy grace period",
          path: ["absentAfterLateMinutes"],
        });
      }
    }
    if (data.isDefault && !data.isActive) {
      ctx.addIssue({
        code: "custom",
        message: "System default policy must be active",
        path: ["isDefault"],
      });
    }
  });

export type PolicyFormValues = z.infer<typeof policyDrawerFormSchema>;

export function createDefaultPolicyForm(): PolicyFormValues {
  return {
    name: "",
    description: "",
    tardyGraceMinutes: 15,
    tardyCountFrom: "schedule_start",
    absentAfterLateMinutes: "",
    undertimeGraceMinutes: 0,
    earlyInWindowMinutes: 240,
    lateOutWindowMinutes: 240,
    duplicateTapWindowSeconds: 120,
    isDefault: false,
    isActive: true,
  };
}

export function policyToFormValues(policy: AttendancePolicyRecord): PolicyFormValues {
  return {
    name: policy.name,
    description: policy.description ?? "",
    tardyGraceMinutes: Math.round(policy.tardyGraceSeconds / 60),
    tardyCountFrom: policy.tardyCountFrom,
    absentAfterLateMinutes:
      policy.absentAfterLateSeconds !== null
        ? String(Math.round(policy.absentAfterLateSeconds / 60))
        : "",
    undertimeGraceMinutes: Math.round(policy.undertimeGraceSeconds / 60),
    earlyInWindowMinutes: Math.round(policy.earlyInWindowSeconds / 60),
    lateOutWindowMinutes: Math.round(policy.lateOutWindowSeconds / 60),
    duplicateTapWindowSeconds: policy.duplicateTapWindowSeconds,
    isDefault: policy.isDefault,
    isActive: policy.isActive,
  };
}

export function policyFormToPayload(values: PolicyFormValues): CreateAttendancePolicyDto {
  const absentStr = values.absentAfterLateMinutes.trim();
  return {
    name: values.name.trim(),
    description: values.description?.trim() ? values.description.trim() : null,
    tardyGraceSeconds: values.tardyGraceMinutes * 60,
    tardyCountFrom: values.tardyCountFrom,
    absentAfterLateSeconds: absentStr ? Number(absentStr) * 60 : null,
    undertimeGraceSeconds: values.undertimeGraceMinutes * 60,
    earlyInWindowSeconds: values.earlyInWindowMinutes * 60,
    lateOutWindowSeconds: values.lateOutWindowMinutes * 60,
    duplicateTapWindowSeconds: values.duplicateTapWindowSeconds,
    isDefault: values.isDefault,
    isActive: values.isDefault ? true : values.isActive,
  };
}

export function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null) {
    return "Disabled";
  }
  if (seconds === 0) {
    return "0 min";
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) {
    return `${mins} min`;
  }
  if (mins === 0) {
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }
  return `${hours}h ${mins}m`;
}

export function formatTardyCountFrom(mode: TardyCountFrom): string {
  return mode === "after_grace" ? "After grace" : "Schedule start";
}
