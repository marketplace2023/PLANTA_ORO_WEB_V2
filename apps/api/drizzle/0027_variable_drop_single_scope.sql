ALTER TABLE "catalog"."variable_definitions" DROP CONSTRAINT "variable_definitions_network_master_id_network_master_id_fk";
--> statement-breakpoint
ALTER TABLE "catalog"."variable_definitions" DROP CONSTRAINT "variable_definitions_stage_master_id_stage_master_id_fk";
--> statement-breakpoint
ALTER TABLE "catalog"."variable_definitions" DROP CONSTRAINT "variable_definitions_asset_type_id_asset_types_id_fk";
--> statement-breakpoint
ALTER TABLE "catalog"."variable_definitions" DROP COLUMN "network_master_id";--> statement-breakpoint
ALTER TABLE "catalog"."variable_definitions" DROP COLUMN "stage_master_id";--> statement-breakpoint
ALTER TABLE "catalog"."variable_definitions" DROP COLUMN "asset_type_id";