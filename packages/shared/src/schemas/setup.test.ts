import { describe, expect, it } from "vitest";
import { createOfficeSchema, createReportsItemSchema } from "./organization.js";
import {
  createReferenceItemSchema,
  getReferenceCategoriesByGroup,
  REFERENCE_CATEGORIES,
} from "./reference-setup.js";

describe("organizational & reference setup schemas", () => {
  it("normalizes office codes to uppercase and rejects self-reporting reports items", () => {
    const office = createOfficeSchema.parse({
      code: "  ho-main ",
      name: "Head Office",
      type: "office",
    });
    expect(office.code).toBe("HO-MAIN");
    expect(office.isActive).toBe(true);
    expect(office.sortOrder).toBe(0);

    const selfReport = createReportsItemSchema.safeParse({
      code: "REP-1",
      name: "Invalid Self Report",
      positionId: 5,
      reportsToPositionId: 5,
    });
    expect(selfReport.success).toBe(false);
  });

  it("exposes all 25 reference categories across 3 groups and enforces active default rule", () => {
    expect(REFERENCE_CATEGORIES).toHaveLength(25);
    expect(getReferenceCategoriesByGroup("employee_information")).toHaveLength(12);
    expect(getReferenceCategoriesByGroup("employment")).toHaveLength(8);
    expect(getReferenceCategoriesByGroup("administrative")).toHaveLength(5);

    const valid = createReferenceItemSchema.parse({
      category: "gender",
      code: " female ",
      name: "Female",
      isDefault: true,
      isActive: true,
    });
    expect(valid.code).toBe("FEMALE");

    const invalidDefault = createReferenceItemSchema.safeParse({
      category: "gender",
      code: "OTHER",
      name: "Other",
      isDefault: true,
      isActive: false,
    });
    expect(invalidDefault.success).toBe(false);
  });
});
