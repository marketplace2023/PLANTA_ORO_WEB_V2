CREATE SCHEMA "inventory";
--> statement-breakpoint
CREATE TABLE "maintenance"."work_order_parts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"location_id" uuid,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 4),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory"."items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"sku" varchar(60) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"item_type" varchar(20) DEFAULT 'SPARE' NOT NULL,
	"uom" varchar(10) DEFAULT 'UND' NOT NULL,
	"min_stock" numeric(18, 4) DEFAULT '0' NOT NULL,
	"max_stock" numeric(18, 4),
	"is_critical" boolean DEFAULT false NOT NULL,
	"unit_cost" numeric(18, 4),
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_plant_sku_unique" UNIQUE("plant_id","sku")
);
--> statement-breakpoint
CREATE TABLE "inventory"."locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"location_type" varchar(20) DEFAULT 'ZONE' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "locations_warehouse_code_unique" UNIQUE("warehouse_id","code")
);
--> statement-breakpoint
CREATE TABLE "inventory"."movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"from_location_id" uuid,
	"to_location_id" uuid,
	"quantity" numeric(18, 4) NOT NULL,
	"movement_type" varchar(20) NOT NULL,
	"unit_cost" numeric(18, 4),
	"reference_type" varchar(20) DEFAULT 'MANUAL' NOT NULL,
	"reference_id" uuid,
	"note" text,
	"performed_by" uuid,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_quantity_positive" CHECK ("inventory"."movements"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory"."stock" (
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_on_hand" numeric(18, 4) DEFAULT '0' NOT NULL,
	"quantity_reserved" numeric(18, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "stock_item_id_location_id_pk" PRIMARY KEY("item_id","location_id"),
	CONSTRAINT "stock_on_hand_non_negative" CHECK ("inventory"."stock"."quantity_on_hand" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory"."warehouses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(160) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_plant_code_unique" UNIQUE("plant_id","code")
);
--> statement-breakpoint
ALTER TABLE "maintenance"."work_order_parts" ADD CONSTRAINT "work_order_parts_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "maintenance"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_order_parts" ADD CONSTRAINT "work_order_parts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_order_parts" ADD CONSTRAINT "work_order_parts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "inventory"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance"."work_order_parts" ADD CONSTRAINT "work_order_parts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."items" ADD CONSTRAINT "items_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."items" ADD CONSTRAINT "items_catalog_item_id_asset_models_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog"."asset_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."locations" ADD CONSTRAINT "locations_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."locations" ADD CONSTRAINT "locations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "inventory"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "inventory"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "inventory"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "inventory"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."warehouses" ADD CONSTRAINT "warehouses_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_work_order_parts_wo" ON "maintenance"."work_order_parts" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "idx_work_order_parts_item" ON "maintenance"."work_order_parts" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_items_plant_type" ON "inventory"."items" USING btree ("plant_id","item_type");--> statement-breakpoint
CREATE INDEX "idx_movements_plant_time" ON "inventory"."movements" USING btree ("plant_id","performed_at");--> statement-breakpoint
CREATE INDEX "idx_movements_item" ON "inventory"."movements" USING btree ("item_id","performed_at");--> statement-breakpoint
CREATE INDEX "idx_stock_location" ON "inventory"."stock" USING btree ("location_id","item_id");