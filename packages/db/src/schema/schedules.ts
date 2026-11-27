import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { attendancePolicies } from "./attendance-policies.js";
import { employees } from "./employees.js";
import { users } from "./users.js";

export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  timezone: varchar("timezone", { length: 50 }).notNull().default("Asia/Manila"),
  attendancePolicyId: integer("attendance_policy_id").references(() => attendancePolicies.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scheduleDetails = pgTable(
  "schedule_details",
  {
    id: serial("id").primaryKey(),
    scheduleId: integer("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    codeDay: varchar("code_day", { length: 3 }).notNull(),
    isRestDay: boolean("is_rest_day").notNull().default(false),
    startTime: time("start_time"),
    endTime: time("end_time"),
    tardyStart: time("tardy_start"),
    undertimeStart: time("undertime_start"),
    earlyDismissalStart: time("early_dismissal_start"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("schedule_details_schedule_id_idx").on(table.scheduleId),
    uniqueIndex("schedule_details_schedule_day_start_uq").on(
      table.scheduleId,
      table.dayOfWeek,
      table.startTime,
    ),
  ],
);

export const employeeSchedules = pgTable(
  "employee_schedules",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "restrict" }),
    scheduleId: integer("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "restrict" }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("employee_schedules_emp_from_uq").on(table.employeeId, table.effectiveFrom),
    index("employee_schedules_emp_range_idx").on(
      table.employeeId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);
