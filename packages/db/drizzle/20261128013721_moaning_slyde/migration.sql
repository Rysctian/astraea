CREATE TABLE "employee_attendance" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"schedule_id" integer,
	"sched_start" time,
	"sched_end" time,
	"time_in" time,
	"time_out" time,
	"scheduled_seconds" integer DEFAULT 0 NOT NULL,
	"rendered_seconds" integer DEFAULT 0 NOT NULL,
	"absent" boolean DEFAULT false NOT NULL,
	"tardy_seconds" integer DEFAULT 0 NOT NULL,
	"undertime" boolean DEFAULT false NOT NULL,
	"undertime_seconds" integer DEFAULT 0 NOT NULL,
	"early_dismiss" boolean DEFAULT false NOT NULL,
	"holiday" boolean DEFAULT false NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"remarks" text,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"details" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_attendance_logs" (
	"id" serial PRIMARY KEY,
	"employee_attendance_id" integer NOT NULL,
	"employee_log_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"log_type" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_logs" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"device_id" varchar(100),
	"source" varchar(30) DEFAULT 'biometric' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "employee_attendance_emp_date_uq" ON "employee_attendance" ("employee_id","date");--> statement-breakpoint
CREATE INDEX "employee_attendance_date_status_idx" ON "employee_attendance" ("date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_attendance_logs_att_log_uq" ON "employee_attendance_logs" ("employee_attendance_id","employee_log_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_attendance_logs_att_seq_uq" ON "employee_attendance_logs" ("employee_attendance_id","sequence");--> statement-breakpoint
CREATE INDEX "employee_logs_emp_logged_at_idx" ON "employee_logs" ("employee_id","logged_at");--> statement-breakpoint
CREATE INDEX "employee_logs_logged_at_idx" ON "employee_logs" ("logged_at");--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_schedule_id_schedules_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "employee_attendance_logs" ADD CONSTRAINT "employee_attendance_logs_EKXuIauopW6a_fkey" FOREIGN KEY ("employee_attendance_id") REFERENCES "employee_attendance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_attendance_logs" ADD CONSTRAINT "employee_attendance_logs_employee_log_id_employee_logs_id_fkey" FOREIGN KEY ("employee_log_id") REFERENCES "employee_logs"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "employee_logs" ADD CONSTRAINT "employee_logs_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "employee_logs" ADD CONSTRAINT "employee_logs_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;