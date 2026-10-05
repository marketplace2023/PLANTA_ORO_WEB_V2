CREATE SCHEMA "procurement";
--> statement-breakpoint
CREATE TABLE "procurement"."requisition_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requisition_id" uuid NOT NULL,
	"from_status" varchar(20),
	"to_status" varchar(20) NOT NULL,
	"note" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement"."requisition_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requisition_id" uuid NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(10) NOT NULL,
	"estimated_price" numeric(18, 2),
	"received_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "requisition_lines_quantity_positive" CHECK ("procurement"."requisition_lines"."quantity" > 0),
	CONSTRAINT "requisition_lines_received_range" CHECK ("procurement"."requisition_lines"."received_quantity" >= 0 and "procurement"."requisition_lines"."received_quantity" <= "procurement"."requisition_lines"."quantity")
);
--> statement-breakpoint
CREATE TABLE "procurement"."requisitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"requested_by" uuid,
	"stage_id" uuid,
	"asset_id" uuid,
	"work_order_id" uuid,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"priority" varchar(20) DEFAULT 'MEDIUM' NOT NULL,
	"needed_by" date,
	"justification" text NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisitions_plant_code_unique" UNIQUE("plant_id","code")
);
--> statement-breakpoint
CREATE TABLE "procurement"."rfq_invitations" (
	"rfq_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	CONSTRAINT "rfq_invitations_rfq_id_provider_id_pk" PRIMARY KEY("rfq_id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "procurement"."rfqs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfqs_plant_code_unique" UNIQUE("plant_id","code")
);
--> statement-breakpoint
CREATE TABLE "procurement"."supplier_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rfq_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"delivery_days" integer NOT NULL,
	"conditions" text,
	"status" varchar(20) DEFAULT 'SUBMITTED' NOT NULL,
	"submitted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_quotes_rfq_provider_unique" UNIQUE("rfq_id","provider_id"),
	CONSTRAINT "supplier_quotes_amount_positive" CHECK ("procurement"."supplier_quotes"."total_amount" > 0),
	CONSTRAINT "supplier_quotes_delivery_range" CHECK ("procurement"."supplier_quotes"."delivery_days" >= 0 and "procurement"."supplier_quotes"."delivery_days" <= 3650)
);
--> statement-breakpoint
ALTER TABLE "procurement"."requisition_history" ADD CONSTRAINT "requisition_history_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "procurement"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."requisition_history" ADD CONSTRAINT "requisition_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."requisition_lines" ADD CONSTRAINT "requisition_lines_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "procurement"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."requisition_lines" ADD CONSTRAINT "requisition_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."requisitions" ADD CONSTRAINT "requisitions_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."requisitions" ADD CONSTRAINT "requisitions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."requisitions" ADD CONSTRAINT "requisitions_stage_id_plant_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "process"."plant_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."requisitions" ADD CONSTRAINT "requisitions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."requisitions" ADD CONSTRAINT "requisitions_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "maintenance"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."requisitions" ADD CONSTRAINT "requisitions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."rfq_invitations" ADD CONSTRAINT "rfq_invitations_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "procurement"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."rfq_invitations" ADD CONSTRAINT "rfq_invitations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."rfqs" ADD CONSTRAINT "rfqs_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."rfqs" ADD CONSTRAINT "rfqs_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "procurement"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."rfqs" ADD CONSTRAINT "rfqs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."supplier_quotes" ADD CONSTRAINT "supplier_quotes_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "procurement"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."supplier_quotes" ADD CONSTRAINT "supplier_quotes_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement"."supplier_quotes" ADD CONSTRAINT "supplier_quotes_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_requisition_history_req" ON "procurement"."requisition_history" USING btree ("requisition_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_requisition_lines_req" ON "procurement"."requisition_lines" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "idx_requisitions_plant_status" ON "procurement"."requisitions" USING btree ("plant_id","status");--> statement-breakpoint
CREATE INDEX "idx_rfq_invitations_provider" ON "procurement"."rfq_invitations" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_rfqs_requisition" ON "procurement"."rfqs" USING btree ("requisition_id");