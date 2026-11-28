import { describe, expect, it } from "vitest";
import { createOvertimeApplicationSchema } from "./overtime.js";

describe("overtime schemas", () => {
  it("validates a valid multi-slot overtime request and normalizes times", () => {
    const parsed = createOvertimeApplicationSchema.parse({
      reason: "Month-end deployment support",
      autoApprove: false,
      details: [
        { date: "2026-11-28", startTime: "18:00", endTime: "21:00", breakSeconds: 1800 },
        { date: "2026-11-29", startTime: "09:00", endTime: "12:00", breakSeconds: 0 },
      ],
    });
    expect(parsed.details[0]?.startTime).toBe("18:00:00");
    expect(parsed.details[0]?.endTime).toBe("21:00:00");
  });

  it("rejects break >= gross duration, overlapping same-day slots, and protected fields", () => {
    const badBreak = createOvertimeApplicationSchema.safeParse({
      reason: "Test",
      details: [{ date: "2026-11-28", startTime: "18:00", endTime: "19:00", breakSeconds: 3600 }],
    });
    expect(badBreak.success).toBe(false);

    const overlap = createOvertimeApplicationSchema.safeParse({
      reason: "Test",
      details: [
        { date: "2026-11-28", startTime: "18:00", endTime: "20:00", breakSeconds: 0 },
        { date: "2026-11-28", startTime: "19:30", endTime: "21:00", breakSeconds: 0 },
      ],
    });
    expect(overlap.success).toBe(false);

    const protectedField = createOvertimeApplicationSchema.safeParse({
      reason: "Test",
      status: "approved",
      details: [{ date: "2026-11-28", startTime: "18:00", endTime: "20:00", breakSeconds: 0 }],
    });
    expect(protectedField.success).toBe(false);
  });
});
