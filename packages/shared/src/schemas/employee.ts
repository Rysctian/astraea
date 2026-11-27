import { employees } from "@starter/db/schema";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";
import type { User } from "./user.js";

export interface ReferenceOption {
  code: string;
  label: string;
}

export const HRIS_REFERENCES = {
  employmentStatuses: [
    { code: "ACTIVE", label: "Active" },
    { code: "PROBATIONARY", label: "Probationary" },
    { code: "ON_LEAVE", label: "On Leave" },
    { code: "SUSPENDED", label: "Suspended" },
    { code: "RESIGNED", label: "Resigned" },
    { code: "TERMINATED", label: "Terminated" },
    { code: "RETIRED", label: "Retired" },
  ],
  employeeTypes: [
    { code: "employee", label: "Employee" },
    { code: "admin", label: "Admin" },
  ],
  workArrangements: [
    { code: "ONSITE", label: "Onsite" },
    { code: "HYBRID", label: "Hybrid" },
    { code: "REMOTE", label: "Remote" },
  ],
  genders: [
    { code: "FEMALE", label: "Female" },
    { code: "MALE", label: "Male" },
    { code: "NON_BINARY", label: "Non-Binary" },
    { code: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
  ],
  civilStatuses: [
    { code: "SINGLE", label: "Single" },
    { code: "MARRIED", label: "Married" },
    { code: "WIDOWED", label: "Widowed" },
    { code: "SEPARATED", label: "Separated" },
  ],
  bloodTypes: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((code) => ({
    code,
    label: code,
  })),
  employeeCategories: [
    { code: "STAFF", label: "Staff" },
    { code: "FACULTY", label: "Faculty" },
    { code: "EXECUTIVE", label: "Executive" },
    { code: "CONSULTANT", label: "Consultant" },
  ],
  appointmentTypes: [
    { code: "PERMANENT", label: "Permanent" },
    { code: "PROBATIONARY", label: "Probationary" },
    { code: "CONTRACTUAL", label: "Contractual" },
    { code: "PROJECT_BASED", label: "Project-Based" },
  ],
  employmentClassifications: [
    { code: "FULL_TIME", label: "Full-Time" },
    { code: "PART_TIME", label: "Part-Time" },
    { code: "INTERN", label: "Intern" },
  ],
  relationships: [
    { code: "SPOUSE", label: "Spouse" },
    { code: "PARENT", label: "Parent" },
    { code: "SIBLING", label: "Sibling" },
    { code: "CHILD", label: "Child" },
    { code: "GUARDIAN", label: "Guardian" },
  ],
  languages: ["English", "Filipino", "Spanish", "Mandarin", "Japanese"],
  educationalAttainments: [
    { code: "HIGH_SCHOOL", label: "High School" },
    { code: "ASSOCIATE", label: "Associate Degree" },
    { code: "BACHELORS", label: "Bachelor's Degree" },
    { code: "MASTERS", label: "Master's Degree" },
    { code: "DOCTORATE", label: "Doctorate" },
  ],
  degreeCoursesByAttainment: {
    HIGH_SCHOOL: ["General Academic Strand", "STEM", "ABM"],
    ASSOCIATE: ["Associate in Computer Technology", "Associate in Business Administration"],
    BACHELORS: [
      "BS Computer Science",
      "BS Information Technology",
      "BS Accountancy",
      "BS Psychology",
      "BS Business Administration",
    ],
    MASTERS: ["MBA", "MS Computer Science", "MA Human Resource Management"],
    DOCTORATE: ["PhD Computer Science", "PhD Organizational Psychology", "DBA"],
  } as Record<string, string[]>,
  separationTypes: [
    { code: "RESIGNATION", label: "Resignation" },
    { code: "RETIREMENT", label: "Retirement" },
    { code: "TERMINATION", label: "Termination" },
    { code: "END_OF_CONTRACT", label: "End of Contract" },
  ],
  separationReasonsByType: {
    RESIGNATION: ["Career Growth", "Relocation", "Personal Reasons", "Further Studies"],
    RETIREMENT: ["Optional Retirement", "Mandatory Retirement"],
    TERMINATION: ["Just Cause", "Authorized Cause", "Non-Regularization"],
    END_OF_CONTRACT: ["Project Completed", "Fixed Term Ended"],
  } as Record<string, string[]>,
  orgHierarchy: {
    "Head Office": {
      Engineering: {
        "Platform Engineering": ["Core API", "Infrastructure"],
        "Product Engineering": ["HRIS Web", "Mobile"],
      },
      "Human Resources": {
        "People Operations": ["Onboarding & 201", "Employee Relations"],
        "Total Rewards": ["Payroll", "Benefits"],
      },
      Finance: {
        Accounting: ["General Ledger", "Accounts Payable"],
      },
    },
    "Regional Hub": {
      Operations: {
        "Field Operations": ["Support Desk", "Logistics"],
      },
      "Human Resources": {
        "Regional HR": ["Talent Acquisition", "Compliance"],
      },
    },
  } as Record<string, Record<string, Record<string, string[]>>>,
  positions: [
    "HR Administrator",
    "People Operations Specialist",
    "Payroll Analyst",
    "Software Engineer",
    "Senior Software Engineer",
    "Engineering Manager",
    "Accountant",
    "Operations Coordinator",
  ],
} as const;

const emptyToNull = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
};

const optionalString = (max: number) =>
  z.preprocess(emptyToNull, z.string().max(max).nullable().optional());

const optionalDate = () =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .nullable()
      .optional(),
  );

const optionalEmail = (max: number) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .max(max)
      .toLowerCase()
      .pipe(z.email("Enter a valid email address"))
      .nullable()
      .optional(),
  );

const employeeEditableFields = {
  type: z.enum(["employee", "admin"]).default("employee"),

  office: optionalString(120),
  department: optionalString(120),
  division: optionalString(120),
  section: optionalString(120),
  position: optionalString(120),
  reportsToEmployeeId: optionalString(30),

  firstName: z.string().trim().min(1, "First name is required").max(100),
  middleName: optionalString(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  nameExtension: optionalString(20),
  birthDate: optionalDate(),
  birthPlace: optionalString(255),
  gender: optionalString(40),
  civilStatus: optionalString(40),
  bloodType: optionalString(30),
  country: optionalString(60),
  nationality: optionalString(60),
  citizenship: optionalString(60),
  religion: optionalString(80),
  disabilityType: optionalString(80),

  educationalAttainment: optionalString(80),
  degreeCourse: optionalString(120),
  languages: z.array(z.string().trim().min(1).max(60)).max(20).nullable().optional(),

  personalEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .pipe(z.email("Enter a valid personal email address")),
  mobileNo: optionalString(30),
  telephoneNo: optionalString(30),
  currentAddress: optionalString(255),
  emergencyContactName: optionalString(150),
  emergencyContactRelationship: optionalString(60),
  emergencyContactNo: optionalString(30),

  employmentStatus: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().min(1).max(60).default("ACTIVE"),
  ),
  employeeCategory: optionalString(60),
  appointmentType: optionalString(60),
  employmentClassification: optionalString(60),
  workArrangement: optionalString(60),
  workEmail: optionalEmail(150),
  dateHired: optionalDate(),
  regularizationDate: optionalDate(),
  separationType: optionalString(60),
  separationReason: optionalString(120),
  separationDate: optionalDate(),

  tinNo: optionalString(30),
  sssNo: optionalString(30),
  philhealthNo: optionalString(30),
  pagibigNo: optionalString(30),
};

export const employeeSchema = createSelectSchema(employees, {
  languages: () => z.array(z.string()).nullable(),
});

export const createEmployeeSchema = z.object(employeeEditableFields);

export const updateEmployeeSchema = z
  .object({
    ...employeeEditableFields,
    type: z.enum(["employee", "admin"]).optional(),
    firstName: z.string().trim().min(1, "First name is required").max(100).optional(),
    lastName: z.string().trim().min(1, "Last name is required").max(100).optional(),
    personalEmail: optionalEmail(255),
    employmentStatus: z.string().trim().min(1).max(60).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const employeeIdParamSchema = z.object({
  employeeId: z
    .string()
    .trim()
    .regex(/^EMP-\d{4}\d{4,}$/, "Invalid employee ID format"),
});

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  department: z.string().trim().optional(),
  position: z.string().trim().optional(),
  employmentStatus: z.string().trim().optional(),
  type: z.string().trim().optional(),
  workArrangement: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  civilStatus: z.string().trim().optional(),
  office: z.string().trim().optional(),
  employeeCategory: z.string().trim().optional(),
  dateFrom: optionalDate(),
  dateTo: optionalDate(),
  sortBy: z
    .enum(["id", "employeeId", "firstName", "lastName", "dateHired", "createdAt"])
    .default("createdAt"),
});

export type Employee = z.infer<typeof employeeSchema>;
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;
export type EmployeeIdParam = z.infer<typeof employeeIdParamSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export interface EmployeeSupervisorSummary {
  employeeId: string;
  firstName: string;
  lastName: string;
  position: string | null;
}

export interface EmployeeDetail {
  employee: Employee;
  supervisor: EmployeeSupervisorSummary | null;
  account: User | null;
}
