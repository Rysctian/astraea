import { users } from "@starter/db/schema";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

export const userSchema = createSelectSchema(users).omit({
  passwordHash: true,
});

export const createUserSchema = createInsertSchema(users, {
  email: () => z.string().trim().pipe(z.email()),
  name: () => z.string().trim().min(1, "Name is required").max(120),
}).pick({
  email: true,
  name: true,
});

export const updateUserSchema = createUserSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const userIdParamSchema = z.object({
  id: z.uuid(),
});

const dateOnlyOptional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
);

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  role: z.enum(["all", "admin", "member"]).default("all"),
  roleId: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  createdFrom: dateOnlyOptional,
  createdTo: dateOnlyOptional,
  sortBy: z.enum(["createdAt", "name", "email", "employeeId", "roleId"]).default("createdAt"),
});

export type User = z.infer<typeof userSchema> & {
  roleCode?: string | null;
  roleName?: string | null;
};
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
