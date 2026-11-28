import { describe, expect, it } from "vitest";
import { createCorrectionApplicationSchema } from "./corrections.js";

describe("corrections schemas", () => {
  it("validates chronological AM/PM punches and normalizes blank strings to null", () => {
    const ok = createCorrectionApplicationSchema.parse({
      reason: "Forgot biometric punch-out",
      details: [{ date: "2026-11-28", amIn: "08:00", amOut: "", pmIn: null, pmOut: "17:00" }],
    });
    expect(ok.details[0]).toEqual({
      date: "2026-11-28",
      amIn: "08:00:00",
      amOut: null,
      pmIn: null,
      pmOut: "17:00:00",
    });
  });

  it("rejects empty punch rows, reversed ordering, duplicate dates, and protected status", () => {
    const empty = createCorrectionApplicationSchema.safeParse({
      reason: "Test",
      details: [{ date: "2026-11-28", amIn: "", amOut: "", pmIn: "", pmOut: "" }],
    });
    expect(empty.success).toBe(false);

    const reversedPm = createCorrectionApplicationSchema.safeParse({
      reason: "Test",
      details: [
        { date: "2026-11-28", amIn: "08:00", amOut: "12:30", pmIn: "12:00", pmOut: "17:00" },
      ],
    });
    expect(reversedPm.success).toBe(false);

    const dupDate = createCorrectionApplicationSchema.safeParse({
      reason: "Test",
      details: [
        { date: "2026-11-28", amIn: "08:00" },
        { date: "2026-11-28", pmOut: "17:00" },
      ],
    });
    expect(dupDate.success).toBe(false);

    const protectedField = createCorrectionApplicationSchema.safeParse({
      reason: "Test",
      status: "approved",
      details: [{ date: "2026-11-28", amIn: "08:00" }],
    });
    expect(protectedField.success).toBe(false);
  });
});
