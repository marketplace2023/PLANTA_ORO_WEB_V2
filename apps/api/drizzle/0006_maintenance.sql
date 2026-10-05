CREATE SCHEMA "maintenance";
--> statement-breakpoint
CREATE TABLE "core"."code_sequences" (
	"plant_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "code_sequences_plant_id_kind_year_pk" PRIMARY KEY("plant_id","kind","year")
);
--> statement-breakpoint
CREATE TABLE "maintenance"."plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"plan_type" varchar(20) DEFAULT 'PREVENTIVE' NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"priority" varchar(20) DEFAULT 'MEDIUM' NOT NULL,
	"frequency_value" integer NOT NULL,
	"frequency_unit" varchar(10) NOT NULL,
	"next_due_at" timestamp with time zone NOT NULL,
	"last_generated_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance"."work_order_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_order_id" uuid NOT NULL,
	"from_status" varchar(20),
	"to_status" varchar(20) NOT NULL,
	"note" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance"."work_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"plan_id" uuid,
	"code" varchar(30) NOT NULL,
	"type" varchar(20) DEFAULT 'CORRECTIVE' NOT NULL,
	"priority" varchar(20) DEFAULT 'MEDIUM' NOT NULL,
	"status" varchar(20) DEFAULT 'REQUESTED' NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"requested_by" uuid,
	"assigned_to" uuid,
	"planned_start" timestamp with time zone,
	"planned_end" timestamp with time zone,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"completion_notes" text,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_plant_code_unique" UNIQUE("plant_id","code")
);
--> statement-breakpoint
ALTER TABLE "core"."code_sequences" ADD CONSTRAINT "code_sequences_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."plans" ADD CONSTRAINT "plans_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."plans" ADD CONSTRAINT "plans_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_order_history" ADD CONSTRAINT "work_order_history_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "maintenance"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_order_history" ADD CONSTRAINT "work_order_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_orders" ADD CONSTRAINT "work_orders_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_orders" ADD CONSTRAINT "work_orders_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_orders" ADD CONSTRAINT "work_orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "maintenance"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_orders" ADD CONSTRAINT "work_orders_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_orders" ADD CONSTRAINT "work_orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_orders" ADD CONSTRAINT "work_orders_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plans_plant_due" ON "maintenance"."plans" USING btree ("plant_id","next_due_at");--> statement-breakpoint
CREATE INDEX "idx_plans_asset" ON "maintenance"."plans" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "idx_work_order_history_wo" ON "maintenance"."work_order_history" USING btree ("work_order_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_work_orders_plant_status" ON "maintenance"."work_orders" USING btree ("plant_id","status");--> statement-breakpoint
CREATE INDEX "idx_work_orders_asset" ON "maintenance"."work_orders" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "idx_work_orders_plant_assignee" ON "maintenance"."work_orders" USING btree ("plant_id","assigned_to");