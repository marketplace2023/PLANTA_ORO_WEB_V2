ALTER TABLE "budget"."lulo_master_families" DROP CONSTRAINT "lulo_family_origin";--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_items" DROP CONSTRAINT "lulo_item_origin";--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_resources" DROP CONSTRAINT "lulo_resource_origin";--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_families" ADD COLUMN "plant_id" uuid;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_families" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_items" ADD COLUMN "plant_id" uuid;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_items" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_resources" ADD COLUMN "plant_id" uuid;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_resources" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_families" ADD CONSTRAINT "lulo_master_families_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_items" ADD CONSTRAINT "lulo_master_items_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_resources" ADD CONSTRAINT "lulo_master_resources_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_families" ADD CONSTRAINT "lulo_family_origin" UNIQUE NULLS NOT DISTINCT("catalog_id","plant_id","resource_type","code");--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_items" ADD CONSTRAINT "lulo_item_origin" UNIQUE NULLS NOT DISTINCT("catalog_id","plant_id","code");--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_resources" ADD CONSTRAINT "lulo_resource_origin" UNIQUE NULLS NOT DISTINCT("catalog_id","plant_id","resource_type","code");