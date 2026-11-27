import type { ReferenceItemRecord } from "@starter/shared";

export interface ReferenceFormValues {
  code: string;
  name: string;
  description: string;
  parentId: string;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

export function createEmptyReferenceForm(): ReferenceFormValues {
  return {
    code: "",
    name: "",
    description: "",
    parentId: "",
    sortOrder: 0,
    isDefault: false,
    isActive: true,
  };
}

export function referenceRecordToFormValues(
  record?: ReferenceItemRecord | null,
): ReferenceFormValues {
  if (!record) {
    return createEmptyReferenceForm();
  }
  return {
    code: record.code,
    name: record.name,
    description: record.description ?? "",
    parentId: record.parentId ? String(record.parentId) : "",
    sortOrder: record.sortOrder,
    isDefault: record.isDefault,
    isActive: record.isActive,
  };
}
