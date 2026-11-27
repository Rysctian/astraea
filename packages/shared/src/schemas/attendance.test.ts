import { describe, expect, it } from "vitest";
import { createAttendancePolicySchema } from "./attendance-policies.js";
import {
  batchAssignScheduleSchema,
  createScheduleSchema,
  resolveScheduleQuerySchema,
} from "./schedules.js";

function makeStandardWeek() {
  return [
    { dayOfWeek: 1, isRestDay: false, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 2, isRestDay: false, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 3, isRestDay: false, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 4, isRestDay: false, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 5, isRestDay: false, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 6, isRestDay: true },
    { dayOfWeek: 7, isRestDay: true },
  ];
}

describe("attendance policy & schedule shared schemas", () => {
  it("enforces absent threshold > tardy grace and active default rules", () => {
    const valid = createAttendancePolicySchema.parse({
      name: "Standard Grace",
      tardyGraceSeconds: 900,
      tardyCountFrom: "after_grace",
      absentAfterLateSeconds: 3600,
      isDefault: true,
      isActive: true,
    });
    expect(valid.earlyInWindowSeconds).toBe(14400);
    expect(valid.duplicateTapWindowSeconds).toBe(120);

    expect(
      createAttendancePolicySchema.safeParse({
        name: "Invalid Absent",
        tardyGraceSeconds: 900,
        absentAfterLateSeconds: 900,
      }).success,
    ).toBe(false);

    expect(
      createAttendancePolicySchema.safeParse({
        name: "Inactive Default",
        isDefault: true,
        isActive: false,
      }).success,
    ).toBe(false);
  });

  it("detects circular Sunday-night into Monday-morning shift overlap", () => {
    const valid = createScheduleSchema.safeParse({
      name: "Regular 9-6",
      timezone: "Asia/Manila",
      details: makeStandardWeek(),
    });
    expect(valid.success).toBe(true);

    const wrappingOverlap = makeStandardWeek();
    wrappingOverlap[6] = {
      dayOfWeek: 7,
      isRestDay: false,
      startTime: "22:00",
      endTime: "10:00",
    };
    const invalid = createScheduleSchema.safeParse({
      name: "Wrap Conflict",
      timezone: "Asia/Manila",
      details: wrappingOverlap,
    });
    expect(invalid.success).toBe(false);
  });

  it("validates batch employee assignment bounds and 366-day resolution limit", () => {
    expect(
      batchAssignScheduleSchema.safeParse({
        scheduleId: 1,
        employeeIds: ["EMP-1", "EMP-1"],
        effectiveFrom: "2026-01-01",
      }).success,
    ).toBe(false);

    expect(
      resolveScheduleQuerySchema.safeParse({
        from: "2026-01-01",
        to: "2027-01-02",
      }).success,
    ).toBe(false);

    expect(
      resolveScheduleQuerySchema.safeParse({
        from: "2026-01-01",
        to: "2026-12-31",
      }).success,
    ).toBe(true);
  });
});
