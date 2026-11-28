CREATE TABLE "employee_leave_credit_logs" (
	"id" serial PRIMARY KEY,
	"employee_leave_credit_id" integer NOT NULL,
	"change_type" varchar(24) NOT NULL,
	"amount" numeric(6,2) NOT NULL,
	"balance_after" numeric(6,2) NOT NULL,
	"leave_application_id" integer,
	"remarks" varchar(255),
	"acted_by" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_leave_credits" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL,
	"leave_type_id" integer NOT NULL,
	"year" integer NOT NULL,
	"allocated_credits" numeric(6,2) DEFAULT '0.00' NOT NULL,
	"used_credits" numeric(6,2) DEFAULT '0.00' NOT NULL,
	"pending_credits" numeric(6,2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_application_details" (
	"id" serial PRIMARY KEY,
	"leave_application_id" integer NOT NULL,
	"date" date NOT NULL,
	"duration_type" varchar(20) DEFAULT 'whole_day' NOT NULL,
	"day_value" numeric(4,2) DEFAULT '1.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_applications" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL,
	"leave_type_id" integer NOT NULL,
	"filed_by_user_id" uuid,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"total_days" numeric(6,2) NOT NULL,
	"reason" text NOT NULL,
	"attachment_path" varchar(255),
	"attachment_name" varchar(255),
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"decision_remarks" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_policies" (
	"id" serial PRIMARY KEY,
	"name" varchar(100) NOT NULL UNIQUE,
	"description" varchar(255),
	"min_notice_days" integer DEFAULT 0 NOT NULL,
	"allow_backdated_filing" boolean DEFAULT false NOT NULL,
	"max_backdated_days" integer,
	"max_consecutive_days" integer,
	"allow_half_day" boolean DEFAULT true NOT NULL,
	"accrual_mode" varchar(32) DEFAULT 'upfront_annual' NOT NULL,
	"allow_negative_balance" boolean DEFAULT false NOT NULL,
	"carry_over_enabled" boolean DEFAULT false NOT NULL,
	"carry_over_max_days" numeric(6,2) DEFAULT '0.00' NOT NULL,
	"count_rest_days" boolean DEFAULT false NOT NULL,
	"allow_attachments" boolean DEFAULT false NOT NULL,
	"require_attachment" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" serial PRIMARY KEY,
	"code" varchar(20) NOT NULL UNIQUE,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"leave_policy_id" integer,
	"is_paid" boolean DEFAULT true NOT NULL,
	"requires_credits" boolean DEFAULT true NOT NULL,
	"default_credits" numeric(6,2) DEFAULT '0.00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "employee_leave_credit_logs_credit_id_idx" ON "employee_leave_credit_logs" ("employee_leave_credit_id");--> statement-breakpoint
CREATE INDEX "employee_leave_credit_logs_app_id_idx" ON "employee_leave_credit_logs" ("leave_application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_leave_credits_emp_type_year_uq" ON "employee_leave_credits" ("employee_id","leave_type_id","year");--> statement-breakpoint
CREATE INDEX "employee_leave_credits_emp_year_idx" ON "employee_leave_credits" ("employee_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_application_details_app_date_uq" ON "leave_application_details" ("leave_application_id","date");--> statement-breakpoint
CREATE INDEX "leave_applications_emp_status_idx" ON "leave_applications" ("employee_id","status");--> statement-breakpoint
CREATE INDEX "leave_applications_submitted_at_idx" ON "leave_applications" ("submitted_at");--> statement-breakpoint
CREATE INDEX "leave_policies_default_active_idx" ON "leave_policies" ("is_default","is_active");--> statement-breakpoint
CREATE INDEX "leave_types_active_idx" ON "leave_types" ("is_active");--> statement-breakpoint
ALTER TABLE "employee_leave_credit_logs" ADD CONSTRAINT "employee_leave_credit_logs_UdGov4bg8En3_fkey" FOREIGN KEY ("employee_leave_credit_id") REFERENCES "employee_leave_credits"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_leave_credits" ADD CONSTRAINT "employee_leave_credits_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_leave_credits" ADD CONSTRAINT "employee_leave_credits_leave_type_id_leave_types_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "leave_application_details" ADD CONSTRAINT "leave_application_details_I87F5YLvSwmQ_fkey" FOREIGN KEY ("leave_application_id") REFERENCES "leave_applications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_employee_id_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_leave_type_id_leave_types_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_filed_by_user_id_users_id_fkey" FOREIGN KEY ("filed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_leave_policy_id_leave_policies_id_fkey" FOREIGN KEY ("leave_policy_id") REFERENCES "leave_policies"("id") ON DELETE SET NULL;