import { describe, expect, it } from "vitest";
import { checkOfficialBusinessOverlaps } from "./official-business-validator.js";

describe("official-business-validator", () => {
  it("allows split non-overlapping windows on the same day and ignores disapproved/cancelled applications", () => {
    const ok = checkOfficialBusinessOverlaps({
      employeeId: "EMP-20260001",
      requested: [
        { date: "2026-12-01", startTime: "08:00:00", endTime: "12:00:00" },
        { date: "2026-12-01", startTime: "13:00:00", endTime: "17:00:00" },
      ],
      existingActive: [
        {
          applicationId: 10,
          status: "disapproved",
          date: "2026-12-01",
          startTime: "08:00:00",
          endTime: "17:00:00",
        },
        {
          applicationId: 11,
          status: "cancelled",
          date: "2026-12-01",
          startTime: "09:00:00",
          endTime: "11:00:00",
        },
      ],
    });
    expect(ok).toBeNull();
  });

  it("blocks overlaps against active pending or approved OB/WFH requests", () => {
    const err = checkOfficialBusinessOverlaps({
      employeeId: "EMP-20260001",
      requested: [{ date: "2026-12-01", startTime: "10:00:00", endTime: "14:00:00" }],
      existingActive: [
        {
          applicationId: 25,
          status: "approved",
          date: "2026-12-01",
          startTime: "13:00:00",
          endTime: "17:00:00",
        },
      ],
    });
    expect(err).toMatch(/overlaps existing approved OB\/WFH application #25/i);
  });
});
