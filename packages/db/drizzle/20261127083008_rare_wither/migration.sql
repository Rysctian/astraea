CREATE TABLE "cut_off_periods" (
	"id" serial PRIMARY KEY,
	"cut_off_id" integer NOT NULL,
	"cut_off_no" integer NOT NULL,
	"dtr_date_from" date,
	"dtr_date_to" date,
	"no_dtr" boolean DEFAULT false NOT NULL,
	"confirmation_start_date" date,
	"confirmation_end_date" date,
	"confirmation_time_from" time,
	"confirmation_time_to" time,
	"payroll_date_from" date NOT NULL,
	"payroll_date_to" date NOT NULL,
	"release_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cut_offs" (
	"id" serial PRIMARY KEY,
	"schedule_type" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cut_off_periods_parent_no_uq" ON "cut_off_periods" ("cut_off_id","cut_off_no");--> statement-breakpoint
CREATE INDEX "cut_off_periods_dtr_range_idx" ON "cut_off_periods" ("dtr_date_from","dtr_date_to");--> statement-breakpoint
CREATE INDEX "cut_off_periods_payroll_range_idx" ON "cut_off_periods" ("payroll_date_from","payroll_date_to");--> statement-breakpoint
CREATE INDEX "cut_off_periods_release_date_idx" ON "cut_off_periods" ("release_date");--> statement-breakpoint
CREATE INDEX "cut_offs_year_month_type_idx" ON "cut_offs" ("year","month","schedule_type");--> statement-breakpoint
CREATE INDEX "cut_offs_is_active_idx" ON "cut_offs" ("is_active");--> statement-breakpoint
ALTER TABLE "cut_off_periods" ADD CONSTRAINT "cut_off_periods_cut_off_id_cut_offs_id_fkey" FOREIGN KEY ("cut_off_id") REFERENCES "cut_offs"("id") ON DELETE CASCADE;