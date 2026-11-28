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
import { schedules } from "./schedules.js";
import { users } from "./users.js";

export const employeeLogs = pgTable(
  "employee_logs",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "restrict" }),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
    deviceId: varchar("device_id", { length: 100 }),
    source: varchar("source", { length: 30 }).notNull().default("biometric"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("employee_logs_emp_logged_at_idx").on(table.employeeId, table.loggedAt),
    index("employee_logs_logged_at_idx").on(table.loggedAt),
  ],
);

export const employeeAttendance = pgTable(
  "employee_attendance",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 })
      .notNull()
      .references(() => employees.employeeId, { onDelete: "restrict" }),
    date: date("date").notNull(),
    scheduleId: integer("schedule_id").references(() => schedules.id, { onDelete: "restrict" }),
    schedStart: time("sched_start"),
    schedEnd: time("sched_end"),
    timeIn: time("time_in"),
    timeOut: time("time_out"),
    scheduledSeconds: integer("scheduled_seconds").notNull().default(0),
    renderedSeconds: integer("rendered_seconds").notNull().default(0),
    absent: boolean("absent").notNull().default(false),
    tardySeconds: integer("tardy_seconds").notNull().default(0),
    undertime: boolean("undertime").notNull().default(false),
    undertimeSeconds: integer("undertime_seconds").notNull().default(0),
    earlyDismiss: boolean("early_dismiss").notNull().default(false),
    holiday: boolean("holiday").notNull().default(false),
    suspended: boolean("suspended").notNull().default(false),
    remarks: text("remarks"),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    details: text("details"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("employee_attendance_emp_date_uq").on(table.employeeId, table.date),
    index("employee_attendance_date_status_idx").on(table.date, table.status),
  ],
);

export const employeeAttendanceLogs = pgTable(
  "employee_attendance_logs",
  {
    id: serial("id").primaryKey(),
    employeeAttendanceId: integer("employee_attendance_id")
      .notNull()
      .references(() => employeeAttendance.id, { onDelete: "cascade" }),
    employeeLogId: integer("employee_log_id")
      .notNull()
      .references(() => employeeLogs.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    logType: varchar("log_type", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("employee_attendance_logs_att_log_uq").on(
      table.employeeAttendanceId,
      table.employeeLogId,
    ),
    uniqueIndex("employee_attendance_logs_att_seq_uq").on(
      table.employeeAttendanceId,
      table.sequence,
    ),
  ],
);
