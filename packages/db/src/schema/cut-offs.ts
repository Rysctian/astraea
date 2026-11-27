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
  varchar,
} from "drizzle-orm/pg-core";

export const cutOffs = pgTable(
  "cut_offs",
  {
    id: serial("id").primaryKey(),
    scheduleType: varchar("schedule_type", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cut_offs_year_month_type_idx").on(table.year, table.month, table.scheduleType),
    index("cut_offs_is_active_idx").on(table.isActive),
  ],
);

export const cutOffPeriods = pgTable(
  "cut_off_periods",
  {
    id: serial("id").primaryKey(),
    cutOffId: integer("cut_off_id")
      .notNull()
      .references(() => cutOffs.id, { onDelete: "cascade" }),
    cutOffNo: integer("cut_off_no").notNull(),
    dtrDateFrom: date("dtr_date_from"),
    dtrDateTo: date("dtr_date_to"),
    noDtr: boolean("no_dtr").notNull().default(false),
    confirmationStartDate: date("confirmation_start_date"),
    confirmationEndDate: date("confirmation_end_date"),
    confirmationTimeFrom: time("confirmation_time_from"),
    confirmationTimeTo: time("confirmation_time_to"),
    payrollDateFrom: date("payroll_date_from").notNull(),
    payrollDateTo: date("payroll_date_to").notNull(),
    releaseDate: date("release_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cut_off_periods_parent_no_uq").on(table.cutOffId, table.cutOffNo),
    index("cut_off_periods_dtr_range_idx").on(table.dtrDateFrom, table.dtrDateTo),
    index("cut_off_periods_payroll_range_idx").on(table.payrollDateFrom, table.payrollDateTo),
    index("cut_off_periods_release_date_idx").on(table.releaseDate),
  ],
);
