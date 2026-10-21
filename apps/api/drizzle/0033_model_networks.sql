CREATE TABLE "catalog"."asset_model_networks" (
	"asset_model_id" uuid NOT NULL,
	"network_master_id" uuid NOT NULL,
	CONSTRAINT "asset_model_networks_asset_model_id_network_master_id_pk" PRIMARY KEY("asset_model_id","network_master_id")
);
--> statement-breakpoint
-- Conserva las redes que cada modelo recibía de su tipo antes de separar la asignación.
INSERT INTO "catalog"."asset_model_networks" ("asset_model_id", "network_master_id")
SELECT m."id", n."network_master_id"
FROM "catalog"."asset_models" m
JOIN "catalog"."asset_type_networks" n ON n."asset_type_id" = m."asset_type_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DROP TABLE "catalog"."asset_type_networks";--> statement-breakpoint
ALTER TABLE "catalog"."asset_model_networks" ADD CONSTRAINT "asset_model_networks_asset_model_id_asset_models_id_fk" FOREIGN KEY ("asset_model_id") REFERENCES "catalog"."asset_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."asset_model_networks" ADD CONSTRAINT "asset_model_networks_network_master_id_network_master_id_fk" FOREIGN KEY ("network_master_id") REFERENCES "plant"."network_master"("id") ON DELETE cascade ON UPDATE no action;
