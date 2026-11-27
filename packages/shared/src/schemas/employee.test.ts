import { describe, expect, it } from "vitest";
import {
  createEmployeeSchema,
  employeeIdParamSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from "./employee.js";

describe("employee 201 schemas", () => {
  it("applies default ACTIVE status and normalizes personal email on create", () => {
    const parsed = createEmployeeSchema.parse({
      firstName: "  Maria ",
      lastName: " Santos ",
      personalEmail: "  Maria.Santos@Example.com ",
      middleName: "   ",
      dateHired: "2026-11-01",
    });

    expect(parsed.firstName).toBe("Maria");
    expect(parsed.lastName).toBe("Santos");
    expect(parsed.personalEmail).toBe("maria.santos@example.com");
    expect(parsed.middleName).toBeNull();
    expect(parsed.employmentStatus).toBe("ACTIVE");
    expect(parsed.type).toBe("employee");
  });

  it("rejects malformed dates and empty update payloads", () => {
    expect(
      createEmployeeSchema.safeParse({
        firstName: "Maria",
        lastName: "Santos",
        personalEmail: "maria@example.com",
        dateHired: "11/01/2026",
      }).success,
    ).toBe(false);

    expect(updateEmployeeSchema.safeParse({}).success).toBe(false);
  });

  it("validates EMP-YYYYNNNN business keys and query pagination", () => {
    expect(employeeIdParamSchema.safeParse({ employeeId: "EMP-20260001" }).success).toBe(true);
    expect(employeeIdParamSchema.safeParse({ employeeId: "12345" }).success).toBe(false);

    const query = listEmployeesQuerySchema.parse({
      page: "2",
      pageSize: "10",
      sortBy: "dateHired",
      sortDir: "asc",
    });
    expect(query).toMatchObject({ page: 2, pageSize: 10, sortBy: "dateHired", sortDir: "asc" });
  });
});
