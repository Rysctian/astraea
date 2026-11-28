import { describe, expect, it } from "vitest";
import {
  checkLeaveDateConflicts,
  computeMaxConsecutiveDays,
  groupRequestedDaysByYear,
  validateLeaveDatesAgainstPolicy,
} from "./leave-validator.js";

describe("leave-validator", () => {
  const strictPolicy = {
    minNoticeDays: 3,
    allowBackdatedFiling: false,
    maxBackdatedDays: null,
    maxConsecutiveDays: 2,
    allowHalfDay: true,
    allowNegativeBalance: false,
    countRestDays: false,
    allowAttachments: true,
    requireAttachment: false,
  };

  it("enforces notice days, backdating, consecutive cap, and rest-day exclusion", () => {
    const tooSoon = validateLeaveDatesAgainstPolicy({
      details: [{ date: "2026-11-30", durationType: "whole_day" }],
      policy: strictPolicy,
      todayIso: "2026-11-28",
      restDates: new Set(),
    });
    expect(tooSoon).toMatch(/advance notice/i);

    const backdated = validateLeaveDatesAgainstPolicy({
      details: [{ date: "2026-11-25", durationType: "whole_day" }],
      policy: strictPolicy,
      todayIso: "2026-11-28",
      restDates: new Set(),
    });
    expect(backdated).toMatch(/backdated/i);

    const restDayErr = validateLeaveDatesAgainstPolicy({
      details: [{ date: "2026-12-05", durationType: "whole_day" }],
      policy: strictPolicy,
      todayIso: "2026-11-28",
      restDates: new Set(["2026-12-05"]),
    });
    expect(restDayErr).toMatch(/rest day/i);

    const consecutiveErr = validateLeaveDatesAgainstPolicy({
      details: [
        { date: "2026-12-07", durationType: "whole_day" },
        { date: "2026-12-08", durationType: "whole_day" },
        { date: "2026-12-09", durationType: "whole_day" },
      ],
      policy: strictPolicy,
      todayIso: "2026-11-28",
      restDates: new Set(),
    });
    expect(consecutiveErr).toMatch(/consecutive/i);
    expect(computeMaxConsecutiveDays(["2026-12-07", "2026-12-08", "2026-12-10"])).toBe(2);
  });

  it("allows complementary AM + PM half-day pairing while blocking same-half or whole-day overlaps", () => {
    const allowedPairing = checkLeaveDateConflicts({
      requested: [{ date: "2026-12-02", durationType: "half_day_pm" }],
      existingActive: [{ applicationId: 7, date: "2026-12-02", durationType: "half_day_am" }],
    });
    expect(allowedPairing).toBeNull();

    const sameHalfConflict = checkLeaveDateConflicts({
      requested: [{ date: "2026-12-02", durationType: "half_day_am" }],
      existingActive: [{ applicationId: 7, date: "2026-12-02", durationType: "half_day_am" }],
    });
    expect(sameHalfConflict).toMatch(/conflicts/i);

    const wholeDayConflict = checkLeaveDateConflicts({
      requested: [{ date: "2026-12-02", durationType: "whole_day" }],
      existingActive: [{ applicationId: 7, date: "2026-12-02", durationType: "half_day_am" }],
    });
    expect(wholeDayConflict).toMatch(/conflicts/i);
  });

  it("groups multi-year leave days in ascending calendar year order", () => {
    const grouped = groupRequestedDaysByYear([
      { date: "2027-01-02", durationType: "half_day_am" },
      { date: "2026-12-30", durationType: "whole_day" },
      { date: "2026-12-31", durationType: "half_day_pm" },
    ]);
    expect(grouped).toEqual([
      { year: 2026, days: 1.5 },
      { year: 2027, days: 0.5 },
    ]);
  });
});
