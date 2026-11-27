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

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  role: z.enum(["all", "admin", "member"]).default("all"),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
});

export type User = z.infer<typeof userSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
