import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createDb } from "../client.js";
import { employeeIdSequences, employees } from "./employees.js";
import {
  departments,
  divisions,
  offices,
  positions,
  reportsItems,
  sections,
} from "./organization.js";
import { setupReferenceItems } from "./reference-items.js";
import { users } from "./users.js";

describe("database schema", () => {
  it("defines the users table with expected columns", () => {
    const config = getTableConfig(users);
    expect(config.name).toBe("users");

    const columnNames = config.columns.map((column) => column.name);
    expect(columnNames).toEqual([
      "id",
      "employee_id",
      "email",
      "name",
      "password_hash",
      "created_at",
      "updated_at",
    ]);
  });

  it("defines the employees and employee_id_sequences tables", () => {
    const empConfig = getTableConfig(employees);
    expect(empConfig.name).toBe("employees");
    const colNames = empConfig.columns.map((c) => c.name);
    expect(colNames).toContain("employee_id");
    expect(colNames).toContain("employment_status");
    expect(colNames).toContain("reports_to_employee_id");
    expect(colNames).toContain("languages");
    expect(colNames).toContain("tin_no");

    const seqConfig = getTableConfig(employeeIdSequences);
    expect(seqConfig.name).toBe("employee_id_sequences");
  });

  it("defines organizational setup and reference catalog tables", () => {
    expect(getTableConfig(offices).name).toBe("offices");
    expect(getTableConfig(departments).name).toBe("departments");
    expect(getTableConfig(divisions).name).toBe("divisions");
    expect(getTableConfig(sections).name).toBe("sections");
    expect(getTableConfig(positions).name).toBe("positions");
    expect(getTableConfig(reportsItems).name).toBe("reports_items");
    expect(getTableConfig(setupReferenceItems).name).toBe("setup_reference_items");
  });

  it("throws when createDb receives an empty connection string", () => {
    expect(() => createDb("")).toThrow("DATABASE_URL is required");
    expect(() => createDb("   ")).toThrow("DATABASE_URL is required");
  });
});
