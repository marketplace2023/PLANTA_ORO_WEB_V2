CREATE TABLE "budget"."lulo_master_catalogs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"counts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_master_components" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"resource_id" uuid,
	"resource_type" text NOT NULL,
	"original_code" text NOT NULL,
	"quantity" numeric(30, 8) NOT NULL,
	"waste_pct" numeric(18, 8),
	"depreciation" numeric(20, 10),
	"source_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "lulo_component_position" UNIQUE("item_id","position")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_master_families" (
	"id" uuid PRIMARY KEY NOT NULL,
	"catalog_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"resource_type" text NOT NULL,
	CONSTRAINT "lulo_family_origin" UNIQUE("catalog_id","resource_type","code")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_master_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"catalog_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"yield_value" numeric(30, 8) NOT NULL,
	"original_unit_price" numeric(30, 8) NOT NULL,
	"issues" jsonb NOT NULL,
	"standard_code" text,
	"source_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "lulo_item_origin" UNIQUE("catalog_id","code")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_master_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"catalog_id" uuid NOT NULL,
	"family_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"resource_type" text NOT NULL,
	"unit" text,
	"original_unit" text,
	"historical_price" numeric(30, 8) NOT NULL,
	"daily_cost" numeric(30, 8),
	"depreciation" numeric(20, 10),
	"waste_pct" numeric(18, 8),
	"source_date" text,
	"currency" text,
	"price_status" text DEFAULT 'HISTORICAL' NOT NULL,
	"source_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "lulo_resource_origin" UNIQUE("catalog_id","resource_type","code")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_plant_master_values" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"value" jsonb NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_plant_master_value" UNIQUE("plant_id","entry_id")
);
--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_catalogs" ADD CONSTRAINT "lulo_master_catalogs_id_master_batches_id_fk" FOREIGN KEY ("id") REFERENCES "budget"."master_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_components" ADD CONSTRAINT "lulo_master_components_item_id_lulo_master_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "budget"."lulo_master_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_components" ADD CONSTRAINT "lulo_master_components_resource_id_lulo_master_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "budget"."lulo_master_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_families" ADD CONSTRAINT "lulo_master_families_id_master_entries_id_fk" FOREIGN KEY ("id") REFERENCES "budget"."master_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_families" ADD CONSTRAINT "lulo_master_families_catalog_id_lulo_master_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "budget"."lulo_master_catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_items" ADD CONSTRAINT "lulo_master_items_id_master_entries_id_fk" FOREIGN KEY ("id") REFERENCES "budget"."master_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_items" ADD CONSTRAINT "lulo_master_items_catalog_id_lulo_master_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "budget"."lulo_master_catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_resources" ADD CONSTRAINT "lulo_master_resources_id_master_entries_id_fk" FOREIGN KEY ("id") REFERENCES "budget"."master_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_resources" ADD CONSTRAINT "lulo_master_resources_catalog_id_lulo_master_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "budget"."lulo_master_catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_resources" ADD CONSTRAINT "lulo_master_resources_family_id_lulo_master_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "budget"."lulo_master_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_plant_master_values" ADD CONSTRAINT "lulo_plant_master_values_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_plant_master_values" ADD CONSTRAINT "lulo_plant_master_values_entry_id_master_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "budget"."master_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lulo_component_resource" ON "budget"."lulo_master_components" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "lulo_item_listing" ON "budget"."lulo_master_items" USING btree ("catalog_id","code");--> statement-breakpoint
CREATE INDEX "lulo_resource_listing" ON "budget"."lulo_master_resources" USING btree ("catalog_id","resource_type","family_id","code");