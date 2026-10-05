CREATE TABLE "maintenance"."work_order_costs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_order_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"description" varchar(200) NOT NULL,
	"resource_id" uuid,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 4) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_order_costs_quantity_positive" CHECK ("maintenance"."work_order_costs"."quantity" > 0),
	CONSTRAINT "work_order_costs_unit_cost_non_negative" CHECK ("maintenance"."work_order_costs"."unit_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "maintenance"."work_order_costs" ADD CONSTRAINT "work_order_costs_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "maintenance"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_order_costs" ADD CONSTRAINT "work_order_costs_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "budget"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_order_costs" ADD CONSTRAINT "work_order_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_work_order_costs_wo" ON "maintenance"."work_order_costs" USING btree ("work_order_id");