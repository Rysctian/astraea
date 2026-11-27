import { HRIS_REFERENCES, type UpdateEmployeeDto } from "@starter/shared";
import type { FieldErrors } from "react-hook-form";
import type { ApiEmployee } from "@/lib/api";

export type EmployeeFormTab = "personal" | "education" | "employment" | "statutory";

export const EMPLOYEE_FORM_TABS: Array<{ id: EmployeeFormTab; label: string }> = [
  { id: "personal", label: "Personal Info" },
  { id: "education", label: "Education & Languages" },
  { id: "employment", label: "Employment & Org" },
  { id: "statutory", label: "Statutory IDs" },
];

export const EMPLOYEE_TAB_FIELDS: Record<EmployeeFormTab, readonly (keyof EmployeeFormValues)[]> = {
  personal: [
    "firstName",
    "middleName",
    "lastName",
    "nameExtension",
    "birthDate",
    "birthPlace",
    "gender",
    "civilStatus",
    "bloodType",
    "country",
    "nationality",
    "citizenship",
    "religion",
    "disabilityType",
    "personalEmail",
    "mobileNo",
    "telephoneNo",
    "currentAddress",
    "emergencyContactName",
    "emergencyContactRelationship",
    "emergencyContactNo",
  ],
  education: ["educationalAttainment", "degreeCourse", "languages"],
  employment: [
    "type",
    "office",
    "department",
    "division",
    "section",
    "position",
    "reportsToEmployeeId",
    "employmentStatus",
    "employeeCategory",
    "appointmentType",
    "employmentClassification",
    "workArrangement",
    "workEmail",
    "dateHired",
    "regularizationDate",
    "separationType",
    "separationReason",
    "separationDate",
  ],
  statutory: ["tinNo", "sssNo", "philhealthNo", "pagibigNo"],
};

export interface EmployeeFormValues {
  type: "employee" | "admin";
  office: string;
  department: string;
  division: string;
  section: string;
  position: string;
  reportsToEmployeeId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  nameExtension: string;
  birthDate: string;
  birthPlace: string;
  gender: string;
  civilStatus: string;
  bloodType: string;
  country: string;
  nationality: string;
  citizenship: string;
  religion: string;
  disabilityType: string;
  educationalAttainment: string;
  degreeCourse: string;
  languages: string[];
  personalEmail: string;
  mobileNo: string;
  telephoneNo: string;
  currentAddress: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactNo: string;
  employmentStatus: string;
  employeeCategory: string;
  appointmentType: string;
  employmentClassification: string;
  workArrangement: string;
  workEmail: string;
  dateHired: string;
  regularizationDate: string;
  separationType: string;
  separationReason: string;
  separationDate: string;
  tinNo: string;
  sssNo: string;
  philhealthNo: string;
  pagibigNo: string;
}

export function createEmptyEmployeeForm(): EmployeeFormValues {
  return {
    type: "employee",
    office: "",
    department: "",
    division: "",
    section: "",
    position: "",
    reportsToEmployeeId: "",
    firstName: "",
    middleName: "",
    lastName: "",
    nameExtension: "",
    birthDate: "",
    birthPlace: "",
    gender: "",
    civilStatus: "",
    bloodType: "",
    country: "",
    nationality: "",
    citizenship: "",
    religion: "",
    disabilityType: "",
    educationalAttainment: "",
    degreeCourse: "",
    languages: [],
    personalEmail: "",
    mobileNo: "",
    telephoneNo: "",
    currentAddress: "",
    emergencyContactName: "",
    emergencyContactRelationship: "",
    emergencyContactNo: "",
    employmentStatus: "ACTIVE",
    employeeCategory: "",
    appointmentType: "",
    employmentClassification: "",
    workArrangement: "",
    workEmail: "",
    dateHired: "",
    regularizationDate: "",
    separationType: "",
    separationReason: "",
    separationDate: "",
    tinNo: "",
    sssNo: "",
    philhealthNo: "",
    pagibigNo: "",
  };
}

export function employeeToFormValues(emp: ApiEmployee): EmployeeFormValues {
  return {
    type: emp.type === "admin" ? "admin" : "employee",
    office: emp.office ?? "",
    department: emp.department ?? "",
    division: emp.division ?? "",
    section: emp.section ?? "",
    position: emp.position ?? "",
    reportsToEmployeeId: emp.reportsToEmployeeId ?? "",
    firstName: emp.firstName,
    middleName: emp.middleName ?? "",
    lastName: emp.lastName,
    nameExtension: emp.nameExtension ?? "",
    birthDate: emp.birthDate ?? "",
    birthPlace: emp.birthPlace ?? "",
    gender: emp.gender ?? "",
    civilStatus: emp.civilStatus ?? "",
    bloodType: emp.bloodType ?? "",
    country: emp.country ?? "",
    nationality: emp.nationality ?? "",
    citizenship: emp.citizenship ?? "",
    religion: emp.religion ?? "",
    disabilityType: emp.disabilityType ?? "",
    educationalAttainment: emp.educationalAttainment ?? "",
    degreeCourse: emp.degreeCourse ?? "",
    languages: emp.languages ?? [],
    personalEmail: emp.personalEmail ?? "",
    mobileNo: emp.mobileNo ?? "",
    telephoneNo: emp.telephoneNo ?? "",
    currentAddress: emp.currentAddress ?? "",
    emergencyContactName: emp.emergencyContactName ?? "",
    emergencyContactRelationship: emp.emergencyContactRelationship ?? "",
    emergencyContactNo: emp.emergencyContactNo ?? "",
    employmentStatus: emp.employmentStatus || "ACTIVE",
    employeeCategory: emp.employeeCategory ?? "",
    appointmentType: emp.appointmentType ?? "",
    employmentClassification: emp.employmentClassification ?? "",
    workArrangement: emp.workArrangement ?? "",
    workEmail: emp.workEmail ?? "",
    dateHired: emp.dateHired ?? "",
    regularizationDate: emp.regularizationDate ?? "",
    separationType: emp.separationType ?? "",
    separationReason: emp.separationReason ?? "",
    separationDate: emp.separationDate ?? "",
    tinNo: emp.tinNo ?? "",
    sssNo: emp.sssNo ?? "",
    philhealthNo: emp.philhealthNo ?? "",
    pagibigNo: emp.pagibigNo ?? "",
  };
}

export function normalizeEmployeePayload(values: EmployeeFormValues): UpdateEmployeeDto {
  return {
    ...values,
    languages: values.languages.length > 0 ? values.languages : null,
  } as UpdateEmployeeDto;
}

export function hasEmployeeTabErrors(
  tab: EmployeeFormTab,
  errors: FieldErrors<EmployeeFormValues>,
): boolean {
  return EMPLOYEE_TAB_FIELDS[tab].some((field) => Boolean(errors[field]));
}

export function getFirstEmployeeErrorTab(
  errors: FieldErrors<EmployeeFormValues>,
): EmployeeFormTab | null {
  for (const tab of EMPLOYEE_FORM_TABS) {
    if (hasEmployeeTabErrors(tab.id, errors)) {
      return tab.id;
    }
  }
  return null;
}

const AVATAR_TONES = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
] as const;

export function getEmployeeStatusBadge(status: string): {
  variant: "emerald" | "amber" | "neutral" | "blue";
  dotColor: string;
  label: string;
} {
  const upper = status.toUpperCase();
  const match = HRIS_REFERENCES.employmentStatuses.find((s) => s.code === upper);
  const label = match?.label ?? status;

  if (upper === "ACTIVE") {
    return { variant: "emerald", dotColor: "bg-emerald-500", label };
  }
  if (upper === "PROBATIONARY" || upper === "ON_LEAVE" || upper === "SUSPENDED") {
    return { variant: "amber", dotColor: "bg-amber-500", label };
  }
  return { variant: "neutral", dotColor: "bg-rose-500", label };
}

export function getEmployeeInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "E";
}

export function getEmployeeAvatarTone(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) {
    sum += seed.charCodeAt(i);
  }
  return AVATAR_TONES[sum % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}

export function formatEmployeeDate(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return "—";
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return dateStr;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export const ALL_DEPARTMENTS = Array.from(
  new Set(Object.values(HRIS_REFERENCES.orgHierarchy).flatMap((depts) => Object.keys(depts))),
);
