CREATE TABLE "catalog"."variable_networks" (
	"variable_id" uuid NOT NULL,
	"network_master_id" uuid NOT NULL,
	CONSTRAINT "variable_networks_variable_id_network_master_id_pk" PRIMARY KEY("variable_id","network_master_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."variable_stages" (
	"variable_id" uuid NOT NULL,
	"stage_master_id" uuid NOT NULL,
	CONSTRAINT "variable_stages_variable_id_stage_master_id_pk" PRIMARY KEY("variable_id","stage_master_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."variable_types" (
	"variable_id" uuid NOT NULL,
	"asset_type_id" uuid NOT NULL,
	CONSTRAINT "variable_types_variable_id_asset_type_id_pk" PRIMARY KEY("variable_id","asset_type_id")
);
--> statement-breakpoint
ALTER TABLE "catalog"."variable_definitions" ADD COLUMN "default_value" jsonb;--> statement-breakpoint
ALTER TABLE "catalog"."variable_networks" ADD CONSTRAINT "variable_networks_variable_id_variable_definitions_id_fk" FOREIGN KEY ("variable_id") REFERENCES "catalog"."variable_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."variable_networks" ADD CONSTRAINT "variable_networks_network_master_id_network_master_id_fk" FOREIGN KEY ("network_master_id") REFERENCES "plant"."network_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."variable_stages" ADD CONSTRAINT "variable_stages_variable_id_variable_definitions_id_fk" FOREIGN KEY ("variable_id") REFERENCES "catalog"."variable_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."variable_stages" ADD CONSTRAINT "variable_stages_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."variable_types" ADD CONSTRAINT "variable_types_variable_id_variable_definitions_id_fk" FOREIGN KEY ("variable_id") REFERENCES "catalog"."variable_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."variable_types" ADD CONSTRAINT "variable_types_asset_type_id_asset_types_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "catalog"."asset_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- El alcance de cada variable (antes una sola red, etapa y tipo) pasa a listas: se copia lo que ya estaba asociado.
INSERT INTO "catalog"."variable_networks" ("variable_id", "network_master_id") SELECT "id", "network_master_id" FROM "catalog"."variable_definitions" WHERE "network_master_id" IS NOT NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "catalog"."variable_stages" ("variable_id", "stage_master_id") SELECT "id", "stage_master_id" FROM "catalog"."variable_definitions" WHERE "stage_master_id" IS NOT NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "catalog"."variable_types" ("variable_id", "asset_type_id") SELECT "id", "asset_type_id" FROM "catalog"."variable_definitions" WHERE "asset_type_id" IS NOT NULL ON CONFLICT DO NOTHING;
