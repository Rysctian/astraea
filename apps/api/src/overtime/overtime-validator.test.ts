import { describe, expect, it } from "vitest";
import { buildBlockedShiftIntervals, validateOvertimeSlotWindow } from "./overtime-validator.js";

describe("overtime-validator", () => {
  it("detects overlap with same-day shifts and computes net requested seconds after break", () => {
    // 2026-11-23 is Monday (ISO weekday 1)
    const { hasDayDefinition, blocked } = buildBlockedShiftIntervals({
      targetDate: "2026-11-23",
      sameDayDetails: [
        { dayOfWeek: 1, isRestDay: false, startTime: "08:00:00", endTime: "17:00:00" },
      ],
      prevDayDetails: [],
    });

    expect(hasDayDefinition).toBe(true);
    expect(blocked).toHaveLength(1);

    const overlap = validateOvertimeSlotWindow({
      employeeId: "EMP-20260001",
      date: "2026-11-23",
      startTime: "16:30:00",
      endTime: "19:00:00",
      breakSeconds: 0,
      blockedShifts: blocked,
      existingOtIntervals: [],
    });
    expect("error" in overlap).toBe(true);

    const valid = validateOvertimeSlotWindow({
      employeeId: "EMP-20260001",
      date: "2026-11-23",
      startTime: "17:00:00",
      endTime: "20:00:00",
      breakSeconds: 1800,
      blockedShifts: blocked,
      existingOtIntervals: [],
    });
    expect(valid).toEqual({ requestedSeconds: 9000 });
  });

  it("blocks prior-day overnight shift spillover even onto an explicit rest day", () => {
    // 2026-11-28 is Saturday (weekday 6), prior day 2026-11-27 is Friday (weekday 5)
    const { hasDayDefinition, blocked } = buildBlockedShiftIntervals({
      targetDate: "2026-11-28",
      sameDayDetails: [{ dayOfWeek: 6, isRestDay: true, startTime: null, endTime: null }],
      prevDayDetails: [
        { dayOfWeek: 5, isRestDay: false, startTime: "22:00:00", endTime: "06:00:00" },
      ],
    });

    expect(hasDayDefinition).toBe(true);
    expect(blocked).toHaveLength(1);

    const spills = validateOvertimeSlotWindow({
      employeeId: "EMP-20260001",
      date: "2026-11-28",
      startTime: "05:00:00",
      endTime: "08:00:00",
      breakSeconds: 0,
      blockedShifts: blocked,
      existingOtIntervals: [],
    });
    expect("error" in spills).toBe(true);

    const afterSpill = validateOvertimeSlotWindow({
      employeeId: "EMP-20260001",
      date: "2026-11-28",
      startTime: "06:00:00",
      endTime: "10:00:00",
      breakSeconds: 0,
      blockedShifts: blocked,
      existingOtIntervals: [],
    });
    expect(afterSpill).toEqual({ requestedSeconds: 14400 });
  });
});
