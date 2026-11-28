import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { employees } from "./employees.js";
import { users } from "./users.js";

export const overtimeApplications = pgTable(
  "overtime_applications",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "cascade" }),
    filedByUserId: uuid("filed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    autoApproved: boolean("auto_approved").notNull().default(false),
    decisionRemarks: text("decision_remarks"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("overtime_applications_emp_status_idx").on(table.employeeId, table.status),
    index("overtime_applications_submitted_at_idx").on(table.submittedAt),
  ],
);

export const overtimeApplicationDetails = pgTable(
  "overtime_application_details",
  {
    id: serial("id").primaryKey(),
    overtimeApplicationId: integer("overtime_application_id")
      .notNull()
      .references(() => overtimeApplications.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    breakSeconds: integer("break_seconds").notNull().default(0),
    requestedSeconds: integer("requested_seconds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("overtime_application_details_app_date_idx").on(table.overtimeApplicationId, table.date),
  ],
);

export type OvertimeApplicationRow = typeof overtimeApplications.$inferSelect;
export type NewOvertimeApplicationRow = typeof overtimeApplications.$inferInsert;
export type OvertimeApplicationDetailRow = typeof overtimeApplicationDetails.$inferSelect;
export type NewOvertimeApplicationDetailRow = typeof overtimeApplicationDetails.$inferInsert;
