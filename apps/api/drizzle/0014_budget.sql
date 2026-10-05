CREATE SCHEMA "budget";
--> statement-breakpoint
CREATE TABLE "budget"."apu_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"apu_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"waste_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "apu_resources_unique" UNIQUE("apu_id","resource_id"),
	CONSTRAINT "apu_resources_quantity_positive" CHECK ("budget"."apu_resources"."quantity" > 0),
	CONSTRAINT "apu_resources_waste_range" CHECK ("budget"."apu_resources"."waste_pct" >= 0 and "budget"."apu_resources"."waste_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "budget"."apus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"unit" varchar(10) NOT NULL,
	"description" text,
	"yield_value" numeric(18, 4) DEFAULT '1' NOT NULL,
	"hours_per_day" numeric(5, 2) DEFAULT '8' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apus_plant_code_unique" UNIQUE("plant_id","code"),
	CONSTRAINT "apus_yield_positive" CHECK ("budget"."apus"."yield_value" > 0),
	CONSTRAINT "apus_hours_range" CHECK ("budget"."apus"."hours_per_day" > 0 and "budget"."apus"."hours_per_day" <= 24)
);
--> statement-breakpoint
CREATE TABLE "budget"."items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"apu_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"unit" varchar(10) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"frozen_unit_price" numeric(18, 4),
	"frozen_breakdown" jsonb,
	CONSTRAINT "budget_items_code_unique" UNIQUE("budget_id","code"),
	CONSTRAINT "budget_items_quantity_positive" CHECK ("budget"."items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "budget"."budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"overhead_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"utility_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"tax_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_plant_code_unique" UNIQUE("plant_id","code"),
	CONSTRAINT "budgets_rates_range" CHECK ("budget"."budgets"."overhead_pct" between 0 and 100 and "budget"."budgets"."utility_pct" between 0 and 100 and "budget"."budgets"."tax_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "budget"."chapters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chapters_budget_code_unique" UNIQUE("budget_id","code")
);
--> statement-breakpoint
CREATE TABLE "budget"."exchange_rates" (
	"plant_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"rate" numeric(18, 6) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_plant_id_currency_pk" PRIMARY KEY("plant_id","currency"),
	CONSTRAINT "exchange_rates_positive" CHECK ("budget"."exchange_rates"."rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "budget"."price_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"resource_id" uuid NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"note" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget"."projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_plant_code_unique" UNIQUE("plant_id","code")
);
--> statement-breakpoint
CREATE TABLE "budget"."resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"resource_type" varchar(20) NOT NULL,
	"unit" varchar(10) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"source_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_plant_code_unique" UNIQUE("plant_id","code"),
	CONSTRAINT "resources_price_non_negative" CHECK ("budget"."resources"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget"."scenarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"adjustments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenarios_budget_name_unique" UNIQUE("budget_id","name")
);
--> statement-breakpoint
CREATE TABLE "budget"."valuation_lines" (
	"valuation_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	CONSTRAINT "valuation_lines_valuation_id_item_id_pk" PRIMARY KEY("valuation_id","item_id"),
	CONSTRAINT "valuation_lines_quantity_positive" CHECK ("budget"."valuation_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "budget"."valuations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"note" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valuations_budget_number_unique" UNIQUE("budget_id","number"),
	CONSTRAINT "valuations_period_order" CHECK ("budget"."valuations"."period_end" >= "budget"."valuations"."period_start")
);
--> statement-breakpoint
ALTER TABLE "budget"."apu_resources" ADD CONSTRAINT "apu_resources_apu_id_apus_id_fk" FOREIGN KEY ("apu_id") REFERENCES "budget"."apus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."apu_resources" ADD CONSTRAINT "apu_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "budget"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."apus" ADD CONSTRAINT "apus_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."items" ADD CONSTRAINT "items_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "budget"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."items" ADD CONSTRAINT "items_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "budget"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."items" ADD CONSTRAINT "items_apu_id_apus_id_fk" FOREIGN KEY ("apu_id") REFERENCES "budget"."apus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."budgets" ADD CONSTRAINT "budgets_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."budgets" ADD CONSTRAINT "budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "budget"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."budgets" ADD CONSTRAINT "budgets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."budgets" ADD CONSTRAINT "budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."chapters" ADD CONSTRAINT "chapters_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "budget"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."exchange_rates" ADD CONSTRAINT "exchange_rates_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."price_history" ADD CONSTRAINT "price_history_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "budget"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."price_history" ADD CONSTRAINT "price_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."projects" ADD CONSTRAINT "projects_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."resources" ADD CONSTRAINT "resources_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."resources" ADD CONSTRAINT "resources_source_item_id_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "inventory"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."scenarios" ADD CONSTRAINT "scenarios_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "budget"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."scenarios" ADD CONSTRAINT "scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."valuation_lines" ADD CONSTRAINT "valuation_lines_valuation_id_valuations_id_fk" FOREIGN KEY ("valuation_id") REFERENCES "budget"."valuations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."valuation_lines" ADD CONSTRAINT "valuation_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "budget"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."valuations" ADD CONSTRAINT "valuations_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "budget"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."valuations" ADD CONSTRAINT "valuations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."valuations" ADD CONSTRAINT "valuations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_apu_resources_apu" ON "budget"."apu_resources" USING btree ("apu_id","position");--> statement-breakpoint
CREATE INDEX "idx_budget_items_chapter" ON "budget"."items" USING btree ("chapter_id","position");--> statement-breakpoint
CREATE INDEX "idx_budgets_plant_status" ON "budget"."budgets" USING btree ("plant_id","status");--> statement-breakpoint
CREATE INDEX "idx_price_history_resource" ON "budget"."price_history" USING btree ("resource_id","changed_at");