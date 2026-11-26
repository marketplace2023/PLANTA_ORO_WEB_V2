CREATE TABLE "asset"."catalog_references" (
	"asset_id" uuid NOT NULL,
	"asset_model_id" uuid NOT NULL,
	CONSTRAINT "catalog_references_asset_id_asset_model_id_pk" PRIMARY KEY("asset_id","asset_model_id")
);
--> statement-breakpoint
ALTER TABLE "asset"."assets" ALTER COLUMN "asset_model_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "asset"."assets" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "asset"."catalog_references" ADD CONSTRAINT "catalog_references_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."catalog_references" ADD CONSTRAINT "catalog_references_asset_model_id_asset_models_id_fk" FOREIGN KEY ("asset_model_id") REFERENCES "catalog"."asset_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."assets" ADD CONSTRAINT "assets_family_id_asset_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "catalog"."asset_families"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE asset.assets a SET family_id = t.family_id FROM catalog.asset_models m JOIN catalog.asset_types t ON t.id=m.asset_type_id WHERE a.asset_model_id=m.id;
--> statement-breakpoint
INSERT INTO asset.catalog_references (asset_id,asset_model_id) SELECT id,asset_model_id FROM asset.assets WHERE asset_model_id IS NOT NULL ON CONFLICT DO NOTHING;
