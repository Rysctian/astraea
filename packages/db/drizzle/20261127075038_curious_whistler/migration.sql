CREATE TABLE "attendance_policies" (
	"id" serial PRIMARY KEY,
	"name" varchar(100) NOT NULL UNIQUE,
	"description" varchar(255),
	"tardy_grace_seconds" integer DEFAULT 0 NOT NULL,
	"tardy_count_from" varchar(20) DEFAULT 'schedule_start' NOT NULL,
	"absent_after_late_seconds" integer,
	"undertime_grace_seconds" integer DEFAULT 0 NOT NULL,
	"early_in_window_seconds" integer DEFAULT 14400 NOT NULL,
	"late_out_window_seconds" integer DEFAULT 14400 NOT NULL,
	"duplicate_tap_window_seconds" integer DEFAULT 120 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_schedules" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL,
	"schedule_id" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_details" (
	"id" serial PRIMARY KEY,
	"schedule_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"code_day" varchar(3) NOT NULL,
	"is_rest_day" boolean DEFAULT false NOT NULL,
	"start_time" time,
	"end_time" time,
	"tardy_start" time,
	"undertime_start" time,
	"early_dismissal_start" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY,
	"name" varchar(100) NOT NULL,
	"timezone" varchar(50) DEFAULT 'Asia/Manila' NOT NULL,
	"attendance_policy_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attendance_policies_active_default_idx" ON "attendance_policies" ("is_active","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_schedules_emp_from_uq" ON "employee_schedules" ("employee_id","effective_from");--> statement-breakpoint
CREATE INDEX "employee_schedules_emp_range_idx" ON "employee_schedules" ("employee_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "schedule_details_schedule_id_idx" ON "schedule_details" ("schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_details_schedule_day_start_uq" ON "schedule_details" ("schedule_id","day_of_week","start_time");--> statement-breakpoint
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_schedule_id_schedules_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_assigned_by_users_id_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "schedule_details" ADD CONSTRAINT "schedule_details_schedule_id_schedules_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_attendance_policy_id_attendance_policies_id_fkey" FOREIGN KEY ("attendance_policy_id") REFERENCES "attendance_policies"("id") ON DELETE SET NULL;