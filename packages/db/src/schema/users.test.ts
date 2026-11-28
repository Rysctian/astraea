import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createDb } from "../client.js";
import { applicationApprovals, approverSetups } from "./approvals.js";
import { employeeAttendance, employeeAttendanceLogs, employeeLogs } from "./attendance.js";
import { attendancePolicies } from "./attendance-policies.js";
import { correctionApplicationDetails, correctionApplications } from "./corrections.js";
import { cutOffPeriods, cutOffs } from "./cut-offs.js";
import { employeeIdSequences, employees } from "./employees.js";
import {
  employeeLeaveCreditLogs,
  employeeLeaveCredits,
  leaveApplicationDetails,
  leaveApplications,
  leavePolicies,
  leaveTypes,
} from "./leave.js";
import {
  officialBusinessApplicationDetails,
  officialBusinessApplications,
} from "./official-business.js";
import {
  departments,
  divisions,
  offices,
  positions,
  reportsItems,
  sections,
} from "./organization.js";
import { overtimeApplicationDetails, overtimeApplications } from "./overtime.js";
import { menus, roleMenuAccess, roles } from "./rbac.js";
import { setupReferenceItems } from "./reference-items.js";
import { employeeSchedules, scheduleDetails, schedules } from "./schedules.js";
import { users } from "./users.js";

describe("database schema", () => {
  it("defines the users table with expected columns", () => {
    const config = getTableConfig(users);
    expect(config.name).toBe("users");

    const columnNames = config.columns.map((column) => column.name);
    expect(columnNames).toEqual([
      "id",
      "employee_id",
      "role_id",
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

  it("defines organizational setup, reference catalog, attendance policy, and schedule tables", () => {
    expect(getTableConfig(offices).name).toBe("offices");
    expect(getTableConfig(departments).name).toBe("departments");
    expect(getTableConfig(divisions).name).toBe("divisions");
    expect(getTableConfig(sections).name).toBe("sections");
    expect(getTableConfig(positions).name).toBe("positions");
    expect(getTableConfig(reportsItems).name).toBe("reports_items");
    expect(getTableConfig(setupReferenceItems).name).toBe("setup_reference_items");
    expect(getTableConfig(attendancePolicies).name).toBe("attendance_policies");
    expect(getTableConfig(schedules).name).toBe("schedules");
    expect(getTableConfig(scheduleDetails).name).toBe("schedule_details");
    expect(getTableConfig(employeeSchedules).name).toBe("employee_schedules");
    expect(getTableConfig(cutOffs).name).toBe("cut_offs");
    expect(getTableConfig(cutOffPeriods).name).toBe("cut_off_periods");
    expect(getTableConfig(roles).name).toBe("roles");
    expect(getTableConfig(menus).name).toBe("menus");
    expect(getTableConfig(roleMenuAccess).name).toBe("role_menu_access");
    expect(getTableConfig(employeeLogs).name).toBe("employee_logs");
    expect(getTableConfig(employeeAttendance).name).toBe("employee_attendance");
    expect(getTableConfig(employeeAttendanceLogs).name).toBe("employee_attendance_logs");
    expect(getTableConfig(approverSetups).name).toBe("approver_setups");
    expect(getTableConfig(applicationApprovals).name).toBe("application_approvals");
    expect(getTableConfig(overtimeApplications).name).toBe("overtime_applications");
    expect(getTableConfig(overtimeApplicationDetails).name).toBe("overtime_application_details");
    expect(getTableConfig(leavePolicies).name).toBe("leave_policies");
    expect(getTableConfig(leaveTypes).name).toBe("leave_types");
    expect(getTableConfig(employeeLeaveCredits).name).toBe("employee_leave_credits");
    expect(getTableConfig(employeeLeaveCreditLogs).name).toBe("employee_leave_credit_logs");
    expect(getTableConfig(leaveApplications).name).toBe("leave_applications");
    expect(getTableConfig(leaveApplicationDetails).name).toBe("leave_application_details");
    expect(getTableConfig(officialBusinessApplications).name).toBe(
      "official_business_applications",
    );
    expect(getTableConfig(officialBusinessApplicationDetails).name).toBe(
      "official_business_application_details",
    );
    expect(getTableConfig(correctionApplications).name).toBe("correction_applications");
    expect(getTableConfig(correctionApplicationDetails).name).toBe(
      "correction_application_details",
    );
  });

  it("throws when createDb receives an empty connection string", () => {
    expect(() => createDb("")).toThrow("DATABASE_URL is required");
    expect(() => createDb("   ")).toThrow("DATABASE_URL is required");
  });
});
