import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const setupReferenceItems = pgTable(
  "setup_reference_items",
  {
    id: serial("id").primaryKey(),
    group: varchar("group", { length: 40 }).notNull(),
    category: varchar("category", { length: 60 }).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    description: varchar("description", { length: 255 }),
    parentId: integer("parent_id").references((): AnyPgColumn => setupReferenceItems.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    sortOrder: integer("sort_order").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("setup_ref_category_code_uidx").on(table.category, table.code),
    index("setup_ref_group_category_active_idx").on(table.group, table.category, table.isActive),
  ],
);
