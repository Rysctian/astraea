import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

export const REFERENCE_GROUP_KEYS = [
  "employee_information",
  "employment",
  "administrative",
] as const;

export type ReferenceGroupKey = (typeof REFERENCE_GROUP_KEYS)[number];

export interface ReferenceCategoryDefinition {
  category: string;
  group: ReferenceGroupKey;
  label: string;
  description: string;
  parentCategory?: string;
  employeeField?: string;
  isArrayField?: boolean;
}

export const REFERENCE_GROUP_META: Record<
  ReferenceGroupKey,
  { label: string; resource: string; description: string }
> = {
  employee_information: {
    label: "Employee Information",
    resource: "employee_info_setup",
    description: "Demographics, education, language, and personal classification catalogs.",
  },
  employment: {
    label: "Employment Setup",
    resource: "employment_setup",
    description: "Workforce lifecycle, appointment, work setup, and separation catalogs.",
  },
  administrative: {
    label: "Administrative Setup",
    resource: "administrative_setup",
    description: "HR compliance, document types, trainings, awards, and requirement catalogs.",
  },
};

export const REFERENCE_CATEGORIES: readonly ReferenceCategoryDefinition[] = [
  // Employee Information (12 categories)
  {
    category: "gender",
    group: "employee_information",
    label: "Gender",
    description: "Gender classifications for employee profiles.",
    employeeField: "gender",
  },
  {
    category: "civil_status",
    group: "employee_information",
    label: "Civil Status",
    description: "Marital and civil status lookup options.",
    employeeField: "civilStatus",
  },
  {
    category: "blood_type",
    group: "employee_information",
    label: "Blood Type",
    description: "Medical blood group classifications.",
    employeeField: "bloodType",
  },
  {
    category: "country",
    group: "employee_information",
    label: "Country",
    description: "Country of origin and residence options.",
    employeeField: "country",
  },
  {
    category: "nationality",
    group: "employee_information",
    label: "Nationality",
    description: "Nationalities assigned to employee records.",
    employeeField: "nationality",
  },
  {
    category: "citizenship",
    group: "employee_information",
    label: "Citizenship",
    description: "Legal citizenship classifications.",
    employeeField: "citizenship",
  },
  {
    category: "religion",
    group: "employee_information",
    label: "Religion",
    description: "Religious affiliations for personal records.",
    employeeField: "religion",
  },
  {
    category: "educational_attainment",
    group: "employee_information",
    label: "Educational Attainment",
    description: "Highest education tiers (parent for Degree / Course).",
    employeeField: "educationalAttainment",
  },
  {
    category: "degree_course",
    group: "employee_information",
    label: "Degree / Course",
    description: "Academic degrees and programs cascading from Educational Attainment.",
    parentCategory: "educational_attainment",
    employeeField: "degreeCourse",
  },
  {
    category: "relationship_type",
    group: "employee_information",
    label: "Relationship Type",
    description: "Emergency contact and dependent relationship options.",
    employeeField: "emergencyContactRelationship",
  },
  {
    category: "language",
    group: "employee_information",
    label: "Languages",
    description: "Spoken languages selectable on employee profiles.",
    employeeField: "languages",
    isArrayField: true,
  },
  {
    category: "disability_type",
    group: "employee_information",
    label: "Disability Type",
    description: "Disability classifications for inclusivity reporting.",
    employeeField: "disabilityType",
  },

  // Employment (8 categories)
  {
    category: "employment_type",
    group: "employment",
    label: "Employment Type",
    description: "High-level employee type classifications.",
    employeeField: "type",
  },
  {
    category: "employment_status",
    group: "employment",
    label: "Employment Status",
    description: "Active, probationary, leave, and separated lifecycle statuses.",
    employeeField: "employmentStatus",
  },
  {
    category: "employee_category",
    group: "employment",
    label: "Employee Category",
    description: "Workforce categories such as Staff, Faculty, or Executive.",
    employeeField: "employeeCategory",
  },
  {
    category: "appointment_type",
    group: "employment",
    label: "Appointment Type",
    description: "Permanent, contractual, or project-based appointments.",
    employeeField: "appointmentType",
  },
  {
    category: "employment_classification",
    group: "employment",
    label: "Employment Classification",
    description: "Full-time, part-time, and internship classifications.",
    employeeField: "employmentClassification",
  },
  {
    category: "work_arrangement",
    group: "employment",
    label: "Work Arrangement",
    description: "Onsite, hybrid, and remote work setups.",
    employeeField: "workArrangement",
  },
  {
    category: "separation_type",
    group: "employment",
    label: "Separation Type",
    description: "Workforce exit types (parent for Separation Reason).",
    employeeField: "separationType",
  },
  {
    category: "separation_reason",
    group: "employment",
    label: "Separation Reason",
    description: "Exit reasons cascading from Separation Type.",
    parentCategory: "separation_type",
    employeeField: "separationReason",
  },

  // Administrative (5 categories)
  {
    category: "document_type",
    group: "administrative",
    label: "Document Type",
    description: "201 personnel file document classifications.",
  },
  {
    category: "disciplinary_action_type",
    group: "administrative",
    label: "Disciplinary Action Type",
    description: "Sanction and corrective action categories.",
  },
  {
    category: "training_category",
    group: "administrative",
    label: "Training Category",
    description: "Learning and development training classifications.",
  },
  {
    category: "award_recognition_type",
    group: "administrative",
    label: "Award & Recognition Type",
    description: "Employee commendation and award categories.",
  },
  {
    category: "employee_requirement_type",
    group: "administrative",
    label: "Employee Requirement Type",
    description: "Pre-employment and clearance requirement checklists.",
  },
] as const;

export const REFERENCE_PARENT_CATEGORY_MAP: Record<string, string> = {
  degree_course: "educational_attainment",
  separation_reason: "separation_type",
};

export function getReferenceCategoryDef(category: string): ReferenceCategoryDefinition | undefined {
  return REFERENCE_CATEGORIES.find((c) => c.category === category);
}

export function getReferenceCategoriesByGroup(
  group: ReferenceGroupKey,
): ReferenceCategoryDefinition[] {
  return REFERENCE_CATEGORIES.filter((c) => c.group === group);
}

const emptyToNull = (val: unknown) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed === "" ? null : trimmed;
  }
  return val;
};

const optionalNullableInt = () =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) {
      return null;
    }
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  }, z.number().int().positive().nullable().optional());

export const referenceGroupParamSchema = z.object({
  group: z.enum(REFERENCE_GROUP_KEYS),
});

export const referenceGroupItemParamSchema = z.object({
  group: z.enum(REFERENCE_GROUP_KEYS),
  id: z.coerce.number().int().positive(),
});

export const createReferenceItemSchema = z
  .object({
    category: z.string().trim().min(1, "Category is required").max(60),
    code: z
      .string()
      .trim()
      .min(1, "Code is required")
      .max(50, "Code must be at most 50 characters")
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(1, "Name is required").max(150),
    description: z.preprocess(emptyToNull, z.string().max(255).nullable().optional()),
    parentId: optionalNullableInt(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0, "Sort order must be 0 or greater").default(0),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((data) => !(data.isDefault && !data.isActive), {
    message: "An inactive item cannot be marked as default",
    path: ["isDefault"],
  });

export const updateReferenceItemSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Code is required")
      .max(50, "Code must be at most 50 characters")
      .transform((v) => v.toUpperCase())
      .optional(),
    name: z.string().trim().min(1, "Name is required").max(150).optional(),
    description: z.preprocess(emptyToNull, z.string().max(255).nullable().optional()),
    parentId: optionalNullableInt(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0, "Sort order must be 0 or greater").optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => !(data.isDefault === true && data.isActive === false), {
    message: "An inactive item cannot be marked as default",
    path: ["isDefault"],
  });

export const listReferenceItemsQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1, "Category is required"),
  search: z.string().trim().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  parentId: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(["sortOrder", "id", "code", "name", "createdAt"]).default("sortOrder"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export const referenceOptionsQuerySchema = z.object({
  categories: z.string().trim().optional(),
});

export interface ReferenceItemRecord {
  id: number;
  group: ReferenceGroupKey;
  category: string;
  code: string;
  name: string;
  description: string | null;
  parentId: number | null;
  parentName: string | null;
  parentCode: string | null;
  metadata: Record<string, unknown> | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
  usageCount: number;
  isInUse: boolean;
  usageReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceCategorySummary extends ReferenceCategoryDefinition {
  totalCount: number;
  activeCount: number;
}

export interface ReferenceActiveOption {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  isDefault: boolean;
}

export type ReferenceActiveOptionsMap = Record<string, ReferenceActiveOption[]>;

export type CreateReferenceItemDto = z.infer<typeof createReferenceItemSchema>;
export type UpdateReferenceItemDto = z.infer<typeof updateReferenceItemSchema>;
export type ListReferenceItemsQuery = z.infer<typeof listReferenceItemsQuerySchema>;
export type ReferenceOptionsQuery = z.infer<typeof referenceOptionsQuerySchema>;
