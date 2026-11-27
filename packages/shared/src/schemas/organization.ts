import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

export const ORG_ENTITY_TYPES = [
  "offices",
  "departments",
  "divisions",
  "sections",
  "positions",
  "reports_items",
] as const;

export type OrgEntityType = (typeof ORG_ENTITY_TYPES)[number];

export const OFFICE_TYPES = ["office", "college", "campus", "branch"] as const;
export type OfficeType = (typeof OFFICE_TYPES)[number];

const emptyToNull = (val: unknown) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed === "" ? null : trimmed;
  }
  return val;
};

const optionalNullableString = (max: number) =>
  z.preprocess(emptyToNull, z.string().max(max).nullable().optional());

const optionalNullableInt = () =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) {
      return null;
    }
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  }, z.number().int().positive().nullable().optional());

const uppercaseCode = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(max, `Code must be at most ${max} characters`)
    .transform((v) => v.toUpperCase());

const sortOrderSchema = z.coerce
  .number()
  .int()
  .min(0, "Sort order must be 0 or greater")
  .default(0);

export const orgEntityParamSchema = z.object({
  entity: z.enum(ORG_ENTITY_TYPES),
});

export const orgEntityIdParamSchema = z.object({
  entity: z.enum(ORG_ENTITY_TYPES),
  id: z.coerce.number().int().positive(),
});

export const createOfficeSchema = z.object({
  code: uppercaseCode(30),
  name: z.string().trim().min(1, "Name is required").max(150),
  shortName: optionalNullableString(50),
  type: z.enum(OFFICE_TYPES).default("office"),
  parentId: optionalNullableInt(),
  headEmployeeId: optionalNullableString(30),
  description: optionalNullableString(255),
  sortOrder: sortOrderSchema,
  isActive: z.boolean().default(true),
});

export const createDepartmentSchema = z.object({
  code: uppercaseCode(30),
  name: z.string().trim().min(1, "Name is required").max(150),
  shortName: optionalNullableString(50),
  officeId: optionalNullableInt(),
  headEmployeeId: optionalNullableString(30),
  description: optionalNullableString(255),
  sortOrder: sortOrderSchema,
  isActive: z.boolean().default(true),
});

export const createDivisionSchema = z.object({
  code: uppercaseCode(30),
  name: z.string().trim().min(1, "Name is required").max(150),
  shortName: optionalNullableString(50),
  departmentId: optionalNullableInt(),
  headEmployeeId: optionalNullableString(30),
  description: optionalNullableString(255),
  sortOrder: sortOrderSchema,
  isActive: z.boolean().default(true),
});

export const createSectionSchema = z.object({
  code: uppercaseCode(30),
  name: z.string().trim().min(1, "Name is required").max(150),
  shortName: optionalNullableString(50),
  divisionId: optionalNullableInt(),
  departmentId: optionalNullableInt(),
  headEmployeeId: optionalNullableString(30),
  description: optionalNullableString(255),
  sortOrder: sortOrderSchema,
  isActive: z.boolean().default(true),
});

export const createPositionSchema = z.object({
  code: uppercaseCode(30),
  title: z.string().trim().min(1, "Title is required").max(150),
  departmentId: optionalNullableInt(),
  divisionId: optionalNullableInt(),
  sectionId: optionalNullableInt(),
  reportsToPositionId: optionalNullableInt(),
  salaryGrade: optionalNullableString(30),
  jobLevel: optionalNullableString(50),
  description: optionalNullableString(255),
  sortOrder: sortOrderSchema,
  isActive: z.boolean().default(true),
});

const reportsItemBaseSchema = z.object({
  code: uppercaseCode(50),
  name: z.string().trim().min(1, "Name is required").max(150),
  officeId: optionalNullableInt(),
  departmentId: optionalNullableInt(),
  divisionId: optionalNullableInt(),
  sectionId: optionalNullableInt(),
  positionId: optionalNullableInt(),
  reportsToPositionId: optionalNullableInt(),
  reportsToEmployeeId: optionalNullableString(30),
  description: optionalNullableString(255),
  sortOrder: sortOrderSchema,
  isActive: z.boolean().default(true),
});

const validateReportsItemSelfRef = (data: {
  positionId?: number | null;
  reportsToPositionId?: number | null;
}) =>
  !(data.positionId && data.reportsToPositionId && data.positionId === data.reportsToPositionId);

export const createReportsItemSchema = reportsItemBaseSchema.refine(validateReportsItemSelfRef, {
  message: "Position cannot report to itself",
  path: ["reportsToPositionId"],
});

export const updateOfficeSchema = createOfficeSchema.partial();
export const updateDepartmentSchema = createDepartmentSchema.partial();
export const updateDivisionSchema = createDivisionSchema.partial();
export const updateSectionSchema = createSectionSchema.partial();
export const updatePositionSchema = createPositionSchema.partial();
export const updateReportsItemSchema = reportsItemBaseSchema
  .partial()
  .refine(validateReportsItemSelfRef, {
    message: "Position cannot report to itself",
    path: ["reportsToPositionId"],
  });

export const listOrgQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  type: z.enum(OFFICE_TYPES).optional(),
  officeId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  divisionId: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(["sortOrder", "id", "code", "name", "title", "createdAt"]).default("sortOrder"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export const orgTreeQuerySchema = z.object({
  includeInactive: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
});

export interface UsageMetadata {
  usageCount: number;
  isInUse: boolean;
  usageReason: string | null;
}

export interface OrgRecord extends UsageMetadata {
  id: number;
  code: string;
  name?: string;
  title?: string;
  shortName?: string | null;
  type?: OfficeType;
  parentId?: number | null;
  officeId?: number | null;
  departmentId?: number | null;
  divisionId?: number | null;
  sectionId?: number | null;
  positionId?: number | null;
  reportsToPositionId?: number | null;
  reportsToEmployeeId?: string | null;
  headEmployeeId?: string | null;
  salaryGrade?: string | null;
  jobLevel?: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrgSummaryCounts = Record<OrgEntityType, { total: number; active: number }>;

export interface OrgOptionItem {
  id: number;
  code: string;
  label: string;
  parentId?: number | null;
  officeId?: number | null;
  departmentId?: number | null;
  divisionId?: number | null;
  sectionId?: number | null;
}

export type OrgActiveOptions = Record<OrgEntityType, OrgOptionItem[]>;

export interface OrgTreeSectionNode {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface OrgTreeDivisionNode {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  sections: OrgTreeSectionNode[];
}

export interface OrgTreeDepartmentNode {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  divisions: OrgTreeDivisionNode[];
  sections: OrgTreeSectionNode[];
}

export interface OrgTreeOfficeNode {
  id: number;
  code: string;
  name: string;
  type: OfficeType;
  isActive: boolean;
  children: OrgTreeOfficeNode[];
  departments: OrgTreeDepartmentNode[];
}

export interface OrgHierarchyTree {
  offices: OrgTreeOfficeNode[];
  unassignedDepartments: OrgTreeDepartmentNode[];
}

export type ListOrgQuery = z.infer<typeof listOrgQuerySchema>;
export type OrgTreeQuery = z.infer<typeof orgTreeQuerySchema>;
export type CreateOfficeDto = z.infer<typeof createOfficeSchema>;
export type CreateDepartmentDto = z.infer<typeof createDepartmentSchema>;
export type CreateDivisionDto = z.infer<typeof createDivisionSchema>;
export type CreateSectionDto = z.infer<typeof createSectionSchema>;
export type CreatePositionDto = z.infer<typeof createPositionSchema>;
export type CreateReportsItemDto = z.infer<typeof createReportsItemSchema>;
