import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { employees } from "./employees.js";
import { roles } from "./rbac.js";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: varchar("employee_id", { length: 30 })
    .unique()
    .references(() => employees.employeeId, { onDelete: "set null" }),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "set null" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
