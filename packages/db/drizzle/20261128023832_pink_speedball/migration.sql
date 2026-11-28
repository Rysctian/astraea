CREATE TABLE "official_business_application_details" (
	"id" serial PRIMARY KEY,
	"official_business_application_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official_business_applications" (
	"id" serial PRIMARY KEY,
	"employee_id" varchar(30) NOT NULL,
	"filed_by_user_id" uuid,
	"ob_type" varchar(16) DEFAULT 'ob' NOT NULL,
	"destination" varchar(255),
	"reason" text NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"decision_remarks" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ob_application_details_app_date_idx" ON "official_business_application_details" ("official_business_application_id","date");--> statement-breakpoint
CREATE INDEX "ob_applications_emp_status_idx" ON "official_business_applications" ("employee_id","status");--> statement-breakpoint
CREATE INDEX "ob_applications_ob_type_idx" ON "official_business_applications" ("ob_type");--> statement-breakpoint
CREATE INDEX "ob_applications_submitted_at_idx" ON "official_business_applications" ("submitted_at");--> statement-breakpoint
ALTER TABLE "official_business_application_details" ADD CONSTRAINT "official_business_application_details_P0KerJhzJypj_fkey" FOREIGN KEY ("official_business_application_id") REFERENCES "official_business_applications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "official_business_applications" ADD CONSTRAINT "official_business_applications_kSBeiXjuP1ew_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "official_business_applications" ADD CONSTRAINT "official_business_applications_filed_by_user_id_users_id_fkey" FOREIGN KEY ("filed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;