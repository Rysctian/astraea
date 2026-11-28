import { describe, expect, it } from "vitest";
import { createOfficialBusinessApplicationSchema } from "./official-business.js";

describe("official-business schemas", () => {
  it("requires destination for OB, allows empty destination for WFH, and allows split same-day slots", () => {
    const missingDest = createOfficialBusinessApplicationSchema.safeParse({
      obType: "ob",
      destination: "   ",
      reason: "Client audit",
      details: [{ date: "2026-12-01", startTime: "09:00", endTime: "12:00" }],
    });
    expect(missingDest.success).toBe(false);

    const wfhSplit = createOfficialBusinessApplicationSchema.safeParse({
      obType: "wfh",
      destination: "",
      reason: "Remote sprint delivery",
      details: [
        { date: "2026-12-01", startTime: "08:00", endTime: "12:00" },
        { date: "2026-12-01", startTime: "13:00", endTime: "17:00" },
      ],
    });
    expect(wfhSplit.success).toBe(true);
  });

  it("rejects overlapping same-day slots and client-supplied status", () => {
    const overlap = createOfficialBusinessApplicationSchema.safeParse({
      obType: "ob",
      destination: "Makati HQ",
      reason: "Meeting",
      details: [
        { date: "2026-12-01", startTime: "09:00", endTime: "12:00" },
        { date: "2026-12-01", startTime: "11:30", endTime: "14:00" },
      ],
    });
    expect(overlap.success).toBe(false);

    const protectedField = createOfficialBusinessApplicationSchema.safeParse({
      obType: "wfh",
      reason: "Work from home",
      status: "approved",
      details: [{ date: "2026-12-01", startTime: "08:00", endTime: "17:00" }],
    });
    expect(protectedField.success).toBe(false);
  });
});
