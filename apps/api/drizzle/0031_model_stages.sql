CREATE TABLE "catalog"."asset_model_stages" (
	"asset_model_id" uuid NOT NULL,
	"stage_master_id" uuid NOT NULL,
	CONSTRAINT "asset_model_stages_asset_model_id_stage_master_id_pk" PRIMARY KEY("asset_model_id","stage_master_id")
);
--> statement-breakpoint
ALTER TABLE "catalog"."asset_model_stages" ADD CONSTRAINT "asset_model_stages_asset_model_id_asset_models_id_fk" FOREIGN KEY ("asset_model_id") REFERENCES "catalog"."asset_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."asset_model_stages" ADD CONSTRAINT "asset_model_stages_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE cascade ON UPDATE no action;