CREATE TABLE "employee_id_sequences" (
	"year" integer PRIMARY KEY,
	"last_seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL UNIQUE,
	"type" varchar(255) DEFAULT 'employee' NOT NULL,
	"office" varchar(120),
	"department" varchar(120),
	"division" varchar(120),
	"section" varchar(120),
	"position" varchar(120),
	"reports_to_employee_id" varchar(30),
	"first_name" varchar(100) NOT NULL,
	"middle_name" varchar(100),
	"last_name" varchar(100) NOT NULL,
	"name_extension" varchar(20),
	"birth_date" varchar(10),
	"birth_place" varchar(255),
	"gender" varchar(40),
	"civil_status" varchar(40),
	"blood_type" varchar(30),
	"country" varchar(60),
	"nationality" varchar(60),
	"citizenship" varchar(60),
	"religion" varchar(80),
	"disability_type" varchar(80),
	"educational_attainment" varchar(80),
	"degree_course" varchar(120),
	"languages" jsonb,
	"personal_email" varchar(255),
	"mobile_no" varchar(30),
	"telephone_no" varchar(30),
	"current_address" varchar(255),
	"emergency_contact_name" varchar(150),
	"emergency_contact_relationship" varchar(60),
	"emergency_contact_no" varchar(30),
	"employment_status" varchar(60) DEFAULT 'ACTIVE' NOT NULL,
	"employee_category" varchar(60),
	"appointment_type" varchar(60),
	"employment_classification" varchar(60),
	"work_arrangement" varchar(60),
	"work_email" varchar(150),
	"date_hired" varchar(10),
	"regularization_date" varchar(10),
	"separation_type" varchar(60),
	"separation_reason" varchar(120),
	"separation_date" varchar(10),
	"tin_no" varchar(30),
	"sss_no" varchar(30),
	"philhealth_no" varchar(30),
	"pagibig_no" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employee_id" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_key" UNIQUE("employee_id");--> statement-breakpoint
CREATE INDEX "employees_office_idx" ON "employees" ("office");--> statement-breakpoint
CREATE INDEX "employees_department_idx" ON "employees" ("department");--> statement-breakpoint
CREATE INDEX "employees_position_idx" ON "employees" ("position");--> statement-breakpoint
CREATE INDEX "employees_employment_status_idx" ON "employees" ("employment_status");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE SET NULL;