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

export const officialBusinessApplications = pgTable(
  "official_business_applications",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "cascade" }),
    filedByUserId: uuid("filed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    obType: varchar("ob_type", { length: 16 }).notNull().default("ob"),
    destination: varchar("destination", { length: 255 }),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    autoApproved: boolean("auto_approved").notNull().default(false),
    decisionRemarks: text("decision_remarks"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ob_applications_emp_status_idx").on(table.employeeId, table.status),
    index("ob_applications_ob_type_idx").on(table.obType),
    index("ob_applications_submitted_at_idx").on(table.submittedAt),
  ],
);

export const officialBusinessApplicationDetails = pgTable(
  "official_business_application_details",
  {
    id: serial("id").primaryKey(),
    officialBusinessApplicationId: integer("official_business_application_id")
      .notNull()
      .references(() => officialBusinessApplications.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ob_application_details_app_date_idx").on(
      table.officialBusinessApplicationId,
      table.date,
    ),
  ],
);

export type OfficialBusinessApplicationRow = typeof officialBusinessApplications.$inferSelect;
export type OfficialBusinessApplicationDetailRow =
  typeof officialBusinessApplicationDetails.$inferSelect;
