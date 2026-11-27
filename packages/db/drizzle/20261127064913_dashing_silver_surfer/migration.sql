CREATE TABLE "departments" (
	"id" serial PRIMARY KEY,
	"code" varchar(30) NOT NULL UNIQUE,
	"name" varchar(150) NOT NULL,
	"short_name" varchar(50),
	"office_id" integer,
	"head_employee_id" varchar(30),
	"description" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" serial PRIMARY KEY,
	"code" varchar(30) NOT NULL UNIQUE,
	"name" varchar(150) NOT NULL,
	"short_name" varchar(50),
	"department_id" integer,
	"head_employee_id" varchar(30),
	"description" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" serial PRIMARY KEY,
	"code" varchar(30) NOT NULL UNIQUE,
	"name" varchar(150) NOT NULL,
	"short_name" varchar(50),
	"type" varchar(20) DEFAULT 'office' NOT NULL,
	"parent_id" integer,
	"head_employee_id" varchar(30),
	"description" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY,
	"code" varchar(30) NOT NULL UNIQUE,
	"title" varchar(150) NOT NULL,
	"department_id" integer,
	"division_id" integer,
	"section_id" integer,
	"reports_to_position_id" integer,
	"salary_grade" varchar(30),
	"job_level" varchar(50),
	"description" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports_items" (
	"id" serial PRIMARY KEY,
	"code" varchar(50) NOT NULL UNIQUE,
	"name" varchar(150) NOT NULL,
	"office_id" integer,
	"department_id" integer,
	"division_id" integer,
	"section_id" integer,
	"position_id" integer,
	"reports_to_position_id" integer,
	"reports_to_employee_id" varchar(30),
	"description" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" serial PRIMARY KEY,
	"code" varchar(30) NOT NULL UNIQUE,
	"name" varchar(150) NOT NULL,
	"short_name" varchar(50),
	"division_id" integer,
	"department_id" integer,
	"head_employee_id" varchar(30),
	"description" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_reference_items" (
	"id" serial PRIMARY KEY,
	"group" varchar(40) NOT NULL,
	"category" varchar(60) NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" varchar(255),
	"parent_id" integer,
	"metadata" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "departments_office_active_idx" ON "departments" ("office_id","is_active");--> statement-breakpoint
CREATE INDEX "divisions_dept_active_idx" ON "divisions" ("department_id","is_active");--> statement-breakpoint
CREATE INDEX "offices_type_active_idx" ON "offices" ("type","is_active");--> statement-breakpoint
CREATE INDEX "positions_dept_active_idx" ON "positions" ("department_id","is_active");--> statement-breakpoint
CREATE INDEX "reports_items_office_dept_active_idx" ON "reports_items" ("office_id","department_id","is_active");--> statement-breakpoint
CREATE INDEX "sections_div_dept_active_idx" ON "sections" ("division_id","department_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "setup_ref_category_code_uidx" ON "setup_reference_items" ("category","code");--> statement-breakpoint
CREATE INDEX "setup_ref_group_category_active_idx" ON "setup_reference_items" ("group","category","is_active");--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_office_id_offices_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_employee_id_employees_employee_id_fkey" FOREIGN KEY ("head_employee_id") REFERENCES "employees"("employee_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_head_employee_id_employees_employee_id_fkey" FOREIGN KEY ("head_employee_id") REFERENCES "employees"("employee_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_parent_id_offices_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "offices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_head_employee_id_employees_employee_id_fkey" FOREIGN KEY ("head_employee_id") REFERENCES "employees"("employee_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_division_id_divisions_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_section_id_sections_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_reports_to_position_id_positions_id_fkey" FOREIGN KEY ("reports_to_position_id") REFERENCES "positions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reports_items" ADD CONSTRAINT "reports_items_office_id_offices_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reports_items" ADD CONSTRAINT "reports_items_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reports_items" ADD CONSTRAINT "reports_items_division_id_divisions_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reports_items" ADD CONSTRAINT "reports_items_section_id_sections_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reports_items" ADD CONSTRAINT "reports_items_position_id_positions_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reports_items" ADD CONSTRAINT "reports_items_reports_to_position_id_positions_id_fkey" FOREIGN KEY ("reports_to_position_id") REFERENCES "positions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reports_items" ADD CONSTRAINT "reports_items_reports_to_employee_id_employees_employee_id_fkey" FOREIGN KEY ("reports_to_employee_id") REFERENCES "employees"("employee_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_division_id_divisions_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_head_employee_id_employees_employee_id_fkey" FOREIGN KEY ("head_employee_id") REFERENCES "employees"("employee_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "setup_reference_items" ADD CONSTRAINT "setup_reference_items_parent_id_setup_reference_items_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "setup_reference_items"("id") ON DELETE SET NULL;