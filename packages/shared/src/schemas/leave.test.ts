import { describe, expect, it } from "vitest";
import {
  createLeaveApplicationSchema,
  createLeavePolicySchema,
  createLeaveTypeSchema,
} from "./leave.js";

describe("leave schemas", () => {
  it("validates leave policy cross-field rules", () => {
    const valid = createLeavePolicySchema.safeParse({
      name: "Standard Policy",
      allowAttachments: true,
      requireAttachment: true,
      isDefault: true,
      isActive: true,
    });
    expect(valid.success).toBe(true);

    const invalidAttachment = createLeavePolicySchema.safeParse({
      name: "Bad Policy",
      allowAttachments: false,
      requireAttachment: true,
    });
    expect(invalidAttachment.success).toBe(false);

    const inactiveDefault = createLeavePolicySchema.safeParse({
      name: "Inactive Default",
      isDefault: true,
      isActive: false,
    });
    expect(inactiveDefault.success).toBe(false);
  });

  it("uppercases leave type codes and validates unique dates & protected fields on applications", () => {
    const lt = createLeaveTypeSchema.parse({ code: "vl", name: "Vacation Leave" });
    expect(lt.code).toBe("VL");

    const dupDates = createLeaveApplicationSchema.safeParse({
      leaveTypeId: 1,
      reason: "Family trip",
      details: [
        { date: "2026-12-01", durationType: "whole_day" },
        { date: "2026-12-01", durationType: "half_day_am" },
      ],
    });
    expect(dupDates.success).toBe(false);

    const protectedField = createLeaveApplicationSchema.safeParse({
      leaveTypeId: 1,
      reason: "Trip",
      status: "approved",
      details: [{ date: "2026-12-01", durationType: "whole_day" }],
    });
    expect(protectedField.success).toBe(false);
  });
});
