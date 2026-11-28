import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

export const RBAC_ACTIONS = ["view", "create", "update", "delete"] as const;
export type RbacAction = (typeof RBAC_ACTIONS)[number];

export const SYSTEM_ROLE_CODES = ["admin", "employee"] as const;

const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const roleGrantInputSchema = z
  .object({
    menuId: z.coerce.number().int().positive(),
    canView: z.boolean().default(false),
    canCreate: z.boolean().default(false),
    canUpdate: z.boolean().default(false),
    canDelete: z.boolean().default(false),
  })
  .superRefine((grant, ctx) => {
    if ((grant.canCreate || grant.canUpdate || grant.canDelete) && !grant.canView) {
      ctx.addIssue({
        code: "custom",
        message: "View permission is required when Create, Update, or Delete is enabled",
        path: ["canView"],
      });
    }
  });

export type RoleGrantInput = z.infer<typeof roleGrantInputSchema>;

const grantsArraySchema = z
  .array(roleGrantInputSchema)
  .default([])
  .refine(
    (items) => new Set(items.map((i) => i.menuId)).size === items.length,
    "Duplicate menu grants are not allowed",
  );

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Role name is required").max(100),
  code: z
    .string()
    .trim()
    .min(1, "Role code is required")
    .max(100)
    .regex(
      ROLE_CODE_PATTERN,
      "Role code must start with a lowercase letter and contain only lowercase letters, numbers, and underscores",
    ),
  grants: grantsArraySchema,
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1, "Role name is required").max(100),
  grants: grantsArraySchema,
});

export const roleIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const assignUserRoleSchema = z.object({
  roleId: z.coerce.number().int().positive("Role is required"),
});

const dateOnlyOptional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().regex(DATE_PATTERN, "Date must be YYYY-MM-DD").optional(),
);

export const listRolesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  code: z.string().trim().optional(),
  createdFrom: dateOnlyOptional,
  createdTo: dateOnlyOptional,
  sortBy: z.enum(["createdAt", "id", "code", "name"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
export type AssignUserRoleDto = z.infer<typeof assignUserRoleSchema>;
export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;

export interface RoleGrantRecord {
  menuId: number;
  menuCode: string;
  menuTitle: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface RoleRecord {
  id: number;
  code: string;
  name: string;
  isSystem: boolean;
  userCount: number;
  grantCount: number;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDetailRecord extends RoleRecord {
  grants: RoleGrantRecord[];
}

export interface RoleOptionItem {
  id: number;
  code: string;
  name: string;
}

export interface MenuLeafItem {
  id: number;
  code: string;
  title: string;
  path: string;
  parentId: number | null;
  sortOrder: number;
}

export interface MenuCatalogGroup {
  parentId: number | null;
  parentCode: string | null;
  parentTitle: string;
  sortOrder: number;
  items: MenuLeafItem[];
}

export interface MenuPermissionFlags {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface CurrentUserAccessResponse {
  role: RoleOptionItem | null;
  permissions: Record<string, MenuPermissionFlags>;
  navigation: Array<{
    id: number;
    code: string;
    title: string;
    path: string | null;
    children: Array<{
      id: number;
      code: string;
      title: string;
      path: string;
    }>;
  }>;
}
