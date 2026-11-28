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
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { employees } from "./employees.js";
import { users } from "./users.js";

export const correctionApplications = pgTable(
  "correction_applications",
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
    index("correction_applications_emp_status_idx").on(table.employeeId, table.status),
    index("correction_applications_submitted_at_idx").on(table.submittedAt),
  ],
);

export const correctionApplicationDetails = pgTable(
  "correction_application_details",
  {
    id: serial("id").primaryKey(),
    correctionApplicationId: integer("correction_application_id")
      .notNull()
      .references(() => correctionApplications.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    oldAmIn: time("old_am_in"),
    oldAmOut: time("old_am_out"),
    oldPmIn: time("old_pm_in"),
    oldPmOut: time("old_pm_out"),
    amIn: time("am_in"),
    amOut: time("am_out"),
    pmIn: time("pm_in"),
    pmOut: time("pm_out"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("correction_application_details_app_date_uq").on(
      table.correctionApplicationId,
      table.date,
    ),
    index("correction_application_details_date_idx").on(table.date),
  ],
);

export type CorrectionApplicationRow = typeof correctionApplications.$inferSelect;
export type CorrectionApplicationDetailRow = typeof correctionApplicationDetails.$inferSelect;
