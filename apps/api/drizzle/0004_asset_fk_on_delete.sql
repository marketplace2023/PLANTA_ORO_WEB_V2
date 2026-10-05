ALTER TABLE "asset"."asset_networks" DROP CONSTRAINT "asset_networks_plant_network_id_plant_networks_id_fk";
--> statement-breakpoint
ALTER TABLE "asset"."assets" DROP CONSTRAINT "assets_plant_stage_id_plant_stages_id_fk";
--> statement-breakpoint
ALTER TABLE "asset"."asset_networks" ADD CONSTRAINT "asset_networks_plant_network_id_plant_networks_id_fk" FOREIGN KEY ("plant_network_id") REFERENCES "plant"."plant_networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."assets" ADD CONSTRAINT "assets_plant_stage_id_plant_stages_id_fk" FOREIGN KEY ("plant_stage_id") REFERENCES "process"."plant_stages"("id") ON DELETE set null ON UPDATE no action;