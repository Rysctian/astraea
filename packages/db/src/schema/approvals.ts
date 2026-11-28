import {
  index,
  integer,
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

/**
 * Reusable per-employee approval chain templates for all 4 online application types:
 * overtime, official_business, correction, leave.
 */
export const approverSetups = pgTable(
  "approver_setups",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "cascade" }),
    applicationType: varchar("application_type", { length: 32 }).notNull(),
    approverId: varchar("approver_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("approver_setups_emp_type_seq_uq").on(
      table.employeeId,
      table.applicationType,
      table.sequence,
    ),
    uniqueIndex("approver_setups_emp_type_approver_uq").on(
      table.employeeId,
      table.applicationType,
      table.approverId,
    ),
    index("approver_setups_approver_id_idx").on(table.approverId),
    index("approver_setups_type_idx").on(table.applicationType),
  ],
);

/**
 * Immutable point-in-time approval chain snapshots for in-flight and historical applications.
 * Polymorphic reference: (application_type, application_id) identifies the owning application row.
 */
export const applicationApprovals = pgTable(
  "application_approvals",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "cascade" }),
    applicationType: varchar("application_type", { length: 32 }).notNull(),
    applicationId: integer("application_id").notNull(),
    approverId: varchar("approver_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    remarks: text("remarks"),
    actedAt: timestamp("acted_at", { withTimezone: true }),
    actedByUserId: uuid("acted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("application_approvals_type_app_seq_uq").on(
      table.applicationType,
      table.applicationId,
      table.sequence,
    ),
    index("application_approvals_emp_type_idx").on(table.employeeId, table.applicationType),
    index("application_approvals_approver_status_idx").on(table.approverId, table.status),
  ],
);

export type ApproverSetupRow = typeof approverSetups.$inferSelect;
export type NewApproverSetupRow = typeof approverSetups.$inferInsert;
export type ApplicationApprovalRow = typeof applicationApprovals.$inferSelect;
export type NewApplicationApprovalRow = typeof applicationApprovals.$inferInsert;
