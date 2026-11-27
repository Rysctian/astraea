import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { employees } from "./employees.js";

export const offices = pgTable(
  "offices",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    shortName: varchar("short_name", { length: 50 }),
    type: varchar("type", { length: 20 }).notNull().default("office"),
    parentId: integer("parent_id").references((): AnyPgColumn => offices.id, {
      onDelete: "set null",
    }),
    headEmployeeId: varchar("head_employee_id", { length: 30 }).references(
      () => employees.employeeId,
      { onDelete: "set null" },
    ),
    description: varchar("description", { length: 255 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("offices_type_active_idx").on(table.type, table.isActive)],
);

export const departments = pgTable(
  "departments",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    shortName: varchar("short_name", { length: 50 }),
    officeId: integer("office_id").references(() => offices.id, { onDelete: "set null" }),
    headEmployeeId: varchar("head_employee_id", { length: 30 }).references(
      () => employees.employeeId,
      { onDelete: "set null" },
    ),
    description: varchar("description", { length: 255 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("departments_office_active_idx").on(table.officeId, table.isActive)],
);

export const divisions = pgTable(
  "divisions",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    shortName: varchar("short_name", { length: 50 }),
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    headEmployeeId: varchar("head_employee_id", { length: 30 }).references(
      () => employees.employeeId,
      { onDelete: "set null" },
    ),
    description: varchar("description", { length: 255 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("divisions_dept_active_idx").on(table.departmentId, table.isActive)],
);

export const sections = pgTable(
  "sections",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    shortName: varchar("short_name", { length: 50 }),
    divisionId: integer("division_id").references(() => divisions.id, { onDelete: "set null" }),
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    headEmployeeId: varchar("head_employee_id", { length: 30 }).references(
      () => employees.employeeId,
      { onDelete: "set null" },
    ),
    description: varchar("description", { length: 255 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sections_div_dept_active_idx").on(table.divisionId, table.departmentId, table.isActive),
  ],
);

export const positions = pgTable(
  "positions",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    title: varchar("title", { length: 150 }).notNull(),
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    divisionId: integer("division_id").references(() => divisions.id, { onDelete: "set null" }),
    sectionId: integer("section_id").references(() => sections.id, { onDelete: "set null" }),
    reportsToPositionId: integer("reports_to_position_id").references(
      (): AnyPgColumn => positions.id,
      { onDelete: "set null" },
    ),
    salaryGrade: varchar("salary_grade", { length: 30 }),
    jobLevel: varchar("job_level", { length: 50 }),
    description: varchar("description", { length: 255 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("positions_dept_active_idx").on(table.departmentId, table.isActive)],
);

export const reportsItems = pgTable(
  "reports_items",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    officeId: integer("office_id").references(() => offices.id, { onDelete: "set null" }),
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    divisionId: integer("division_id").references(() => divisions.id, { onDelete: "set null" }),
    sectionId: integer("section_id").references(() => sections.id, { onDelete: "set null" }),
    positionId: integer("position_id").references(() => positions.id, { onDelete: "set null" }),
    reportsToPositionId: integer("reports_to_position_id").references(() => positions.id, {
      onDelete: "set null",
    }),
    reportsToEmployeeId: varchar("reports_to_employee_id", { length: 30 }).references(
      () => employees.employeeId,
      { onDelete: "set null" },
    ),
    description: varchar("description", { length: 255 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reports_items_office_dept_active_idx").on(
      table.officeId,
      table.departmentId,
      table.isActive,
    ),
  ],
);
