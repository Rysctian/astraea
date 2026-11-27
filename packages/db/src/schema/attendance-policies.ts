import { boolean, index, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const attendancePolicies = pgTable(
  "attendance_policies",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    description: varchar("description", { length: 255 }),
    tardyGraceSeconds: integer("tardy_grace_seconds").notNull().default(0),
    tardyCountFrom: varchar("tardy_count_from", { length: 20 }).notNull().default("schedule_start"),
    absentAfterLateSeconds: integer("absent_after_late_seconds"),
    undertimeGraceSeconds: integer("undertime_grace_seconds").notNull().default(0),
    earlyInWindowSeconds: integer("early_in_window_seconds").notNull().default(14400),
    lateOutWindowSeconds: integer("late_out_window_seconds").notNull().default(14400),
    duplicateTapWindowSeconds: integer("duplicate_tap_window_seconds").notNull().default(120),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("attendance_policies_active_default_idx").on(table.isActive, table.isDefault)],
);
