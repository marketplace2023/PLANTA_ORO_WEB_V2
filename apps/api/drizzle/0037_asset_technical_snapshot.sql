ALTER TABLE "asset"."assets" ADD COLUMN "specifications" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "asset"."assets" ADD COLUMN "technical_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Conserva la ficha que mostraban los activos existentes al aplicar la migración.
UPDATE asset.assets AS a
SET specifications = m.specifications, technical_data = m.technical_data
FROM catalog.asset_models AS m
WHERE a.asset_model_id = m.id;
