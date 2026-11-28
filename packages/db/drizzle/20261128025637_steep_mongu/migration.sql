CREATE TABLE "correction_application_details" (
	"id" serial PRIMARY KEY,
	"correction_application_id" integer NOT NULL,
	"date" date NOT NULL,
	"old_am_in" time,
	"old_am_out" time,
	"old_pm_in" time,
	"old_pm_out" time,
	"am_in" time,
	"am_out" time,
	"pm_in" time,
	"pm_out" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_applications" (
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
CREATE UNIQUE INDEX "correction_application_details_app_date_uq" ON "correction_application_details" ("correction_application_id","date");--> statement-breakpoint
CREATE INDEX "correction_application_details_date_idx" ON "correction_application_details" ("date");--> statement-breakpoint
CREATE INDEX "correction_applications_emp_status_idx" ON "correction_applications" ("employee_id","status");--> statement-breakpoint
CREATE INDEX "correction_applications_submitted_at_idx" ON "correction_applications" ("submitted_at");--> statement-breakpoint
ALTER TABLE "correction_application_details" ADD CONSTRAINT "correction_application_details_NOoqVk3cCihH_fkey" FOREIGN KEY ("correction_application_id") REFERENCES "correction_applications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "correction_applications" ADD CONSTRAINT "correction_applications_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "correction_applications" ADD CONSTRAINT "correction_applications_filed_by_user_id_users_id_fkey" FOREIGN KEY ("filed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;