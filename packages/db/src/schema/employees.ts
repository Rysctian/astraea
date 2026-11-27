import { index, integer, jsonb, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const employeeIdSequences = pgTable("employee_id_sequences", {
  year: integer("year").primaryKey(),
  lastSeq: integer("last_seq").notNull().default(0),
});

export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    employeeId: varchar("employee_id", { length: 30 }).notNull().unique(),
    type: varchar("type", { length: 255 }).notNull().default("employee"),

    // Organizational hierarchy
    office: varchar("office", { length: 120 }),
    department: varchar("department", { length: 120 }),
    division: varchar("division", { length: 120 }),
    section: varchar("section", { length: 120 }),
    position: varchar("position", { length: 120 }),
    reportsToEmployeeId: varchar("reports_to_employee_id", { length: 30 }),

    // Personal Info
    firstName: varchar("first_name", { length: 100 }).notNull(),
    middleName: varchar("middle_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    nameExtension: varchar("name_extension", { length: 20 }),
    birthDate: varchar("birth_date", { length: 10 }),
    birthPlace: varchar("birth_place", { length: 255 }),
    gender: varchar("gender", { length: 40 }),
    civilStatus: varchar("civil_status", { length: 40 }),
    bloodType: varchar("blood_type", { length: 30 }),
    country: varchar("country", { length: 60 }),
    nationality: varchar("nationality", { length: 60 }),
    citizenship: varchar("citizenship", { length: 60 }),
    religion: varchar("religion", { length: 80 }),
    disabilityType: varchar("disability_type", { length: 80 }),

    // Education & Languages
    educationalAttainment: varchar("educational_attainment", { length: 80 }),
    degreeCourse: varchar("degree_course", { length: 120 }),
    languages: jsonb("languages").$type<string[]>(),

    // Contact & Emergency
    personalEmail: varchar("personal_email", { length: 255 }),
    mobileNo: varchar("mobile_no", { length: 30 }),
    telephoneNo: varchar("telephone_no", { length: 30 }),
    currentAddress: varchar("current_address", { length: 255 }),
    emergencyContactName: varchar("emergency_contact_name", { length: 150 }),
    emergencyContactRelationship: varchar("emergency_contact_relationship", { length: 60 }),
    emergencyContactNo: varchar("emergency_contact_no", { length: 30 }),

    // Employment & Separation
    employmentStatus: varchar("employment_status", { length: 60 }).notNull().default("ACTIVE"),
    employeeCategory: varchar("employee_category", { length: 60 }),
    appointmentType: varchar("appointment_type", { length: 60 }),
    employmentClassification: varchar("employment_classification", { length: 60 }),
    workArrangement: varchar("work_arrangement", { length: 60 }),
    workEmail: varchar("work_email", { length: 150 }),
    dateHired: varchar("date_hired", { length: 10 }),
    regularizationDate: varchar("regularization_date", { length: 10 }),
    separationType: varchar("separation_type", { length: 60 }),
    separationReason: varchar("separation_reason", { length: 120 }),
    separationDate: varchar("separation_date", { length: 10 }),

    // Statutory IDs
    tinNo: varchar("tin_no", { length: 30 }),
    sssNo: varchar("sss_no", { length: 30 }),
    philhealthNo: varchar("philhealth_no", { length: 30 }),
    pagibigNo: varchar("pagibig_no", { length: 30 }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("employees_office_idx").on(table.office),
    index("employees_department_idx").on(table.department),
    index("employees_position_idx").on(table.position),
    index("employees_employment_status_idx").on(table.employmentStatus),
  ],
);

export type EmployeeRow = typeof employees.$inferSelect;
export type NewEmployeeRow = typeof employees.$inferInsert;
