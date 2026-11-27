import { describe, expect, it } from "vitest";
import { createCutOffSchema, normalizeCutOffPeriod } from "./cut-offs.js";

const validPeriod1 = {
  cutOffNo: 1,
  noDtr: false,
  dtrDateFrom: "2026-10-01",
  dtrDateTo: "2026-10-15",
  confirmationStartDate: "2026-10-16",
  confirmationEndDate: "2026-10-16",
  confirmationTimeFrom: "08:00",
  confirmationTimeTo: "17:00",
  payrollDateFrom: "2026-10-01",
  payrollDateTo: "2026-10-15",
  releaseDate: "2026-10-20",
};

const validPeriod2 = {
  cutOffNo: 2,
  noDtr: true,
  dtrDateFrom: "2026-10-16",
  dtrDateTo: "2026-10-31",
  payrollDateFrom: "2026-10-16",
  payrollDateTo: "2026-10-31",
  releaseDate: "2026-11-05",
};

describe("cut-off shared schemas", () => {
  it("enforces monthly vs semi_monthly period cardinality and strict period fields", () => {
    expect(
      createCutOffSchema.safeParse({
        scheduleType: "monthly",
        name: "Oct 2026 Monthly",
        year: 2026,
        month: 10,
        periods: [validPeriod1],
      }).success,
    ).toBe(true);

    expect(
      createCutOffSchema.safeParse({
        scheduleType: "semi_monthly",
        name: "Missing 2nd",
        year: 2026,
        month: 10,
        periods: [validPeriod1],
      }).success,
    ).toBe(false);

    // Unknown field rejected by .strict()
    expect(
      createCutOffSchema.safeParse({
        scheduleType: "monthly",
        name: "Extra field",
        year: 2026,
        month: 10,
        periods: [{ ...validPeriod1, id: 99 }],
      }).success,
    ).toBe(false);
  });

  it("validates confirmation combined datetime ordering and clears no_dtr fields", () => {
    expect(
      createCutOffSchema.safeParse({
        scheduleType: "monthly",
        name: "Invalid confirm time",
        year: 2026,
        month: 10,
        periods: [
          {
            ...validPeriod1,
            confirmationTimeFrom: "18:00",
            confirmationTimeTo: "09:00",
          },
        ],
      }).success,
    ).toBe(false);

    const parsed = createCutOffSchema.parse({
      scheduleType: "semi_monthly",
      name: "Oct 2026 Semi-Monthly",
      year: 2026,
      month: 10,
      periods: [validPeriod1, validPeriod2],
    });
    const second = parsed.periods[1];
    expect(second).toBeDefined();
    if (!second) return;
    const normalized2 = normalizeCutOffPeriod(second);
    expect(normalized2.dtrDateFrom).toBeNull();
    expect(normalized2.dtrDateTo).toBeNull();
    expect(normalized2.confirmationStartDate).toBeNull();
    expect(normalized2.confirmationTimeFrom).toBeNull();
  });
});
