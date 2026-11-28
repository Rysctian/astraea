import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { employees } from "./employees.js";
import { users } from "./users.js";

export const leavePolicies = pgTable(
  "leave_policies",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    description: varchar("description", { length: 255 }),
    minNoticeDays: integer("min_notice_days").notNull().default(0),
    allowBackdatedFiling: boolean("allow_backdated_filing").notNull().default(false),
    maxBackdatedDays: integer("max_backdated_days"),
    maxConsecutiveDays: integer("max_consecutive_days"),
    allowHalfDay: boolean("allow_half_day").notNull().default(true),
    accrualMode: varchar("accrual_mode", { length: 32 }).notNull().default("upfront_annual"),
    allowNegativeBalance: boolean("allow_negative_balance").notNull().default(false),
    carryOverEnabled: boolean("carry_over_enabled").notNull().default(false),
    carryOverMaxDays: numeric("carry_over_max_days", { precision: 6, scale: 2 })
      .notNull()
      .default("0.00"),
    countRestDays: boolean("count_rest_days").notNull().default(false),
    allowAttachments: boolean("allow_attachments").notNull().default(false),
    requireAttachment: boolean("require_attachment").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("leave_policies_default_active_idx").on(table.isDefault, table.isActive)],
);

export const leaveTypes = pgTable(
  "leave_types",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 255 }),
    leavePolicyId: integer("leave_policy_id").references(() => leavePolicies.id, {
      onDelete: "set null",
    }),
    isPaid: boolean("is_paid").notNull().default(true),
    requiresCredits: boolean("requires_credits").notNull().default(true),
    defaultCredits: numeric("default_credits", { precision: 6, scale: 2 })
      .notNull()
      .default("0.00"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("leave_types_active_idx").on(table.isActive)],
);

export const employeeLeaveCredits = pgTable(
  "employee_leave_credits",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "cascade" }),
    leaveTypeId: integer("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    allocatedCredits: numeric("allocated_credits", { precision: 6, scale: 2 })
      .notNull()
      .default("0.00"),
    usedCredits: numeric("used_credits", { precision: 6, scale: 2 }).notNull().default("0.00"),
    pendingCredits: numeric("pending_credits", { precision: 6, scale: 2 })
      .notNull()
      .default("0.00"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("employee_leave_credits_emp_type_year_uq").on(
      table.employeeId,
      table.leaveTypeId,
      table.year,
    ),
    index("employee_leave_credits_emp_year_idx").on(table.employeeId, table.year),
  ],
);

/**
 * Append-only audit ledger for all leave credit mutations (no updated_at).
 */
export const employeeLeaveCreditLogs = pgTable(
  "employee_leave_credit_logs",
  {
    id: serial("id").primaryKey(),
    employeeLeaveCreditId: integer("employee_leave_credit_id")
      .notNull()
      .references(() => employeeLeaveCredits.id, { onDelete: "cascade" }),
    changeType: varchar("change_type", { length: 24 }).notNull(),
    amount: numeric("amount", { precision: 6, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 6, scale: 2 }).notNull(),
    leaveApplicationId: integer("leave_application_id"),
    remarks: varchar("remarks", { length: 255 }),
    actedBy: varchar("acted_by", { length: 30 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("employee_leave_credit_logs_credit_id_idx").on(table.employeeLeaveCreditId),
    index("employee_leave_credit_logs_app_id_idx").on(table.leaveApplicationId),
  ],
);

export const leaveApplications = pgTable(
  "leave_applications",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "cascade" }),
    leaveTypeId: integer("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    filedByUserId: uuid("filed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to").notNull(),
    totalDays: numeric("total_days", { precision: 6, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    attachmentPath: varchar("attachment_path", { length: 255 }),
    attachmentName: varchar("attachment_name", { length: 255 }),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    autoApproved: boolean("auto_approved").notNull().default(false),
    decisionRemarks: text("decision_remarks"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("leave_applications_emp_status_idx").on(table.employeeId, table.status),
    index("leave_applications_submitted_at_idx").on(table.submittedAt),
  ],
);

export const leaveApplicationDetails = pgTable(
  "leave_application_details",
  {
    id: serial("id").primaryKey(),
    leaveApplicationId: integer("leave_application_id")
      .notNull()
      .references(() => leaveApplications.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    durationType: varchar("duration_type", { length: 20 }).notNull().default("whole_day"),
    dayValue: numeric("day_value", { precision: 4, scale: 2 }).notNull().default("1.00"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("leave_application_details_app_date_uq").on(table.leaveApplicationId, table.date),
  ],
);

export type LeavePolicyRow = typeof leavePolicies.$inferSelect;
export type LeaveTypeRow = typeof leaveTypes.$inferSelect;
export type EmployeeLeaveCreditRow = typeof employeeLeaveCredits.$inferSelect;
export type EmployeeLeaveCreditLogRow = typeof employeeLeaveCreditLogs.$inferSelect;
export type LeaveApplicationRow = typeof leaveApplications.$inferSelect;
export type LeaveApplicationDetailRow = typeof leaveApplicationDetails.$inferSelect;
