import {
  createDepartmentSchema,
  createDivisionSchema,
  createOfficeSchema,
  createPositionSchema,
  createReportsItemSchema,
  createSectionSchema,
  type OfficeType,
  type OrgEntityType,
  type OrgRecord,
} from "@starter/shared";

export interface OrgTabMeta {
  entity: OrgEntityType;
  label: string;
  singular: string;
  description: string;
}

export const ORG_TABS: readonly OrgTabMeta[] = [
  {
    entity: "offices",
    label: "Offices / Colleges",
    singular: "Office",
    description: "Top-level offices, colleges, campuses, or branches.",
  },
  {
    entity: "departments",
    label: "Departments",
    singular: "Department",
    description: "Functional departments operating under offices.",
  },
  {
    entity: "divisions",
    label: "Divisions",
    singular: "Division",
    description: "Operational divisions grouped under departments.",
  },
  {
    entity: "sections",
    label: "Sections / Units",
    singular: "Section",
    description: "Leaf organizational sections aligned to divisions & departments.",
  },
  {
    entity: "positions",
    label: "Positions",
    singular: "Position",
    description: "Job catalog titles, salary grades, and reporting hierarchy.",
  },
  {
    entity: "reports_items",
    label: "Reports Items",
    singular: "Reports Item",
    description: "Organizational reporting-line reference templates.",
  },
] as const;

export interface OrgFormValues {
  code: string;
  name: string;
  title: string;
  shortName: string;
  type: OfficeType;
  parentId: string;
  officeId: string;
  departmentId: string;
  divisionId: string;
  sectionId: string;
  positionId: string;
  reportsToPositionId: string;
  reportsToEmployeeId: string;
  headEmployeeId: string;
  salaryGrade: string;
  jobLevel: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export function createEmptyOrgForm(): OrgFormValues {
  return {
    code: "",
    name: "",
    title: "",
    shortName: "",
    type: "office",
    parentId: "",
    officeId: "",
    departmentId: "",
    divisionId: "",
    sectionId: "",
    positionId: "",
    reportsToPositionId: "",
    reportsToEmployeeId: "",
    headEmployeeId: "",
    salaryGrade: "",
    jobLevel: "",
    description: "",
    sortOrder: 0,
    isActive: true,
  };
}

export function orgRecordToFormValues(record?: OrgRecord | null): OrgFormValues {
  if (!record) {
    return createEmptyOrgForm();
  }
  return {
    code: record.code,
    name: record.name ?? "",
    title: record.title ?? "",
    shortName: record.shortName ?? "",
    type: record.type ?? "office",
    parentId: record.parentId ? String(record.parentId) : "",
    officeId: record.officeId ? String(record.officeId) : "",
    departmentId: record.departmentId ? String(record.departmentId) : "",
    divisionId: record.divisionId ? String(record.divisionId) : "",
    sectionId: record.sectionId ? String(record.sectionId) : "",
    positionId: record.positionId ? String(record.positionId) : "",
    reportsToPositionId: record.reportsToPositionId ? String(record.reportsToPositionId) : "",
    reportsToEmployeeId: record.reportsToEmployeeId ?? "",
    headEmployeeId: record.headEmployeeId ?? "",
    salaryGrade: record.salaryGrade ?? "",
    jobLevel: record.jobLevel ?? "",
    description: record.description ?? "",
    sortOrder: record.sortOrder ?? 0,
    isActive: record.isActive ?? true,
  };
}

export function getOrgCreateSchema(entity: OrgEntityType) {
  switch (entity) {
    case "offices":
      return createOfficeSchema;
    case "departments":
      return createDepartmentSchema;
    case "divisions":
      return createDivisionSchema;
    case "sections":
      return createSectionSchema;
    case "positions":
      return createPositionSchema;
    case "reports_items":
      return createReportsItemSchema;
  }
}

export function buildOrgPayload(
  entity: OrgEntityType,
  values: OrgFormValues,
): Record<string, unknown> {
  const toIntOrNull = (val: string) => (val.trim() === "" ? null : Number(val));
  const toStrOrNull = (val: string) => (val.trim() === "" ? null : val.trim());

  const base = {
    code: values.code.trim().toUpperCase(),
    description: toStrOrNull(values.description),
    sortOrder: Number(values.sortOrder) || 0,
    isActive: values.isActive,
  };

  if (entity === "offices") {
    return {
      ...base,
      name: values.name.trim(),
      shortName: toStrOrNull(values.shortName),
      type: values.type,
      parentId: toIntOrNull(values.parentId),
      headEmployeeId: toStrOrNull(values.headEmployeeId),
    };
  }
  if (entity === "departments") {
    return {
      ...base,
      name: values.name.trim(),
      shortName: toStrOrNull(values.shortName),
      officeId: toIntOrNull(values.officeId),
      headEmployeeId: toStrOrNull(values.headEmployeeId),
    };
  }
  if (entity === "divisions") {
    return {
      ...base,
      name: values.name.trim(),
      shortName: toStrOrNull(values.shortName),
      departmentId: toIntOrNull(values.departmentId),
      headEmployeeId: toStrOrNull(values.headEmployeeId),
    };
  }
  if (entity === "sections") {
    return {
      ...base,
      name: values.name.trim(),
      shortName: toStrOrNull(values.shortName),
      departmentId: toIntOrNull(values.departmentId),
      divisionId: toIntOrNull(values.divisionId),
      headEmployeeId: toStrOrNull(values.headEmployeeId),
    };
  }
  if (entity === "positions") {
    return {
      ...base,
      title: values.title.trim(),
      departmentId: toIntOrNull(values.departmentId),
      divisionId: toIntOrNull(values.divisionId),
      sectionId: toIntOrNull(values.sectionId),
      reportsToPositionId: toIntOrNull(values.reportsToPositionId),
      salaryGrade: toStrOrNull(values.salaryGrade),
      jobLevel: toStrOrNull(values.jobLevel),
    };
  }
  return {
    ...base,
    name: values.name.trim(),
    officeId: toIntOrNull(values.officeId),
    departmentId: toIntOrNull(values.departmentId),
    divisionId: toIntOrNull(values.divisionId),
    sectionId: toIntOrNull(values.sectionId),
    positionId: toIntOrNull(values.positionId),
    reportsToPositionId: toIntOrNull(values.reportsToPositionId),
    reportsToEmployeeId: toStrOrNull(values.reportsToEmployeeId),
  };
}
