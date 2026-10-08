CREATE TABLE "catalog"."asset_type_networks" (
	"asset_type_id" uuid NOT NULL,
	"network_master_id" uuid NOT NULL,
	CONSTRAINT "asset_type_networks_asset_type_id_network_master_id_pk" PRIMARY KEY("asset_type_id","network_master_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."asset_type_stages" (
	"asset_type_id" uuid NOT NULL,
	"stage_master_id" uuid NOT NULL,
	CONSTRAINT "asset_type_stages_asset_type_id_stage_master_id_pk" PRIMARY KEY("asset_type_id","stage_master_id")
);
--> statement-breakpoint
ALTER TABLE "catalog"."asset_type_networks" ADD CONSTRAINT "asset_type_networks_asset_type_id_asset_types_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "catalog"."asset_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."asset_type_networks" ADD CONSTRAINT "asset_type_networks_network_master_id_network_master_id_fk" FOREIGN KEY ("network_master_id") REFERENCES "plant"."network_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."asset_type_stages" ADD CONSTRAINT "asset_type_stages_asset_type_id_asset_types_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "catalog"."asset_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."asset_type_stages" ADD CONSTRAINT "asset_type_stages_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE cascade ON UPDATE no action;