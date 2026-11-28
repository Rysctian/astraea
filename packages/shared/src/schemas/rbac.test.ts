import { describe, expect, it } from "vitest";
import { createRoleSchema, roleGrantInputSchema } from "./rbac.js";

describe("RBAC shared schemas", () => {
  it("enforces lowercase role code pattern and view prerequisite on write flags", () => {
    expect(
      createRoleSchema.safeParse({
        name: "HR Operations",
        code: "hr_ops",
        grants: [{ menuId: 1, canView: true, canCreate: true, canUpdate: true, canDelete: false }],
      }).success,
    ).toBe(true);

    expect(
      createRoleSchema.safeParse({
        name: "Invalid Code",
        code: "HR-Ops",
        grants: [],
      }).success,
    ).toBe(false);

    expect(
      roleGrantInputSchema.safeParse({
        menuId: 1,
        canView: false,
        canCreate: true,
        canUpdate: false,
        canDelete: false,
      }).success,
    ).toBe(false);
  });
});
