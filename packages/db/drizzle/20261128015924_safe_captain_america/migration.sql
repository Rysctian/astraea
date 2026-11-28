CREATE TABLE "application_approvals" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL,
	"application_type" varchar(32) NOT NULL,
	"application_id" integer NOT NULL,
	"approver_id" varchar(30) NOT NULL,
	"sequence" integer NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"remarks" text,
	"acted_at" timestamp with time zone,
	"acted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approver_setups" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL,
	"application_type" varchar(32) NOT NULL,
	"approver_id" varchar(30) NOT NULL,
	"sequence" integer NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_application_details" (
	"id" serial PRIMARY KEY,
	"overtime_application_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"break_seconds" integer DEFAULT 0 NOT NULL,
	"requested_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_applications" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL,
	"filed_by_user_id" uuid,
	"reason" text NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"decision_remarks" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "application_approvals_type_app_seq_uq" ON "application_approvals" ("application_type","application_id","sequence");--> statement-breakpoint
CREATE INDEX "application_approvals_emp_type_idx" ON "application_approvals" ("employee_id","application_type");--> statement-breakpoint
CREATE INDEX "application_approvals_approver_status_idx" ON "application_approvals" ("approver_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approver_setups_emp_type_seq_uq" ON "approver_setups" ("employee_id","application_type","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "approver_setups_emp_type_approver_uq" ON "approver_setups" ("employee_id","application_type","approver_id");--> statement-breakpoint
CREATE INDEX "approver_setups_approver_id_idx" ON "approver_setups" ("approver_id");--> statement-breakpoint
CREATE INDEX "approver_setups_type_idx" ON "approver_setups" ("application_type");--> statement-breakpoint
CREATE INDEX "overtime_application_details_app_date_idx" ON "overtime_application_details" ("overtime_application_id","date");--> statement-breakpoint
CREATE INDEX "overtime_applications_emp_status_idx" ON "overtime_applications" ("employee_id","status");--> statement-breakpoint
CREATE INDEX "overtime_applications_submitted_at_idx" ON "overtime_applications" ("submitted_at");--> statement-breakpoint
ALTER TABLE "application_approvals" ADD CONSTRAINT "application_approvals_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "application_approvals" ADD CONSTRAINT "application_approvals_approver_id_employees_employee_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "application_approvals" ADD CONSTRAINT "application_approvals_acted_by_user_id_users_id_fkey" FOREIGN KEY ("acted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "approver_setups" ADD CONSTRAINT "approver_setups_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approver_setups" ADD CONSTRAINT "approver_setups_approver_id_employees_employee_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "approver_setups" ADD CONSTRAINT "approver_setups_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "approver_setups" ADD CONSTRAINT "approver_setups_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "overtime_application_details" ADD CONSTRAINT "overtime_application_details_CVr4mNzet5hk_fkey" FOREIGN KEY ("overtime_application_id") REFERENCES "overtime_applications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "overtime_applications" ADD CONSTRAINT "overtime_applications_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "overtime_applications" ADD CONSTRAINT "overtime_applications_filed_by_user_id_users_id_fkey" FOREIGN KEY ("filed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;