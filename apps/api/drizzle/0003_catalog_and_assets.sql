CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE SCHEMA "asset";
--> statement-breakpoint
CREATE TABLE "catalog"."asset_families" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"parent_id" uuid,
	"description" text,
	"icon" varchar(40),
	CONSTRAINT "asset_families_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."asset_models" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_type_id" uuid NOT NULL,
	"manufacturer_id" uuid,
	"model_name" varchar(200) NOT NULL,
	"specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"technical_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"datasheet_document_id" uuid,
	"status" varchar(30) DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "asset_models_asset_type_id_manufacturer_id_model_name_unique" UNIQUE("asset_type_id","manufacturer_id","model_name")
);
--> statement-breakpoint
CREATE TABLE "catalog"."asset_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"default_specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "asset_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."manufacturers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"country_code" varchar(2),
	"website" text,
	CONSTRAINT "manufacturers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "asset"."asset_networks" (
	"asset_id" uuid NOT NULL,
	"plant_network_id" uuid NOT NULL,
	"relation_type" varchar(40) DEFAULT 'MEMBER' NOT NULL,
	CONSTRAINT "asset_networks_asset_id_plant_network_id_pk" PRIMARY KEY("asset_id","plant_network_id")
);
--> statement-breakpoint
CREATE TABLE "asset"."asset_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"old_status" varchar(30),
	"new_status" varchar(30) NOT NULL,
	"reason" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset"."assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"plant_stage_id" uuid,
	"asset_model_id" uuid NOT NULL,
	"fur_code" varchar(60) NOT NULL,
	"tag" varchar(60) NOT NULL,
	"name" varchar(200) NOT NULL,
	"serial_number" varchar(120),
	"manufacturer_id" uuid,
	"installation_date" date,
	"commission_date" date,
	"status" varchar(30) DEFAULT 'OPERATIVE' NOT NULL,
	"criticality" varchar(20) DEFAULT 'MEDIUM' NOT NULL,
	"location" varchar(200),
	"parent_asset_id" uuid,
	"is_public" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_plant_tag_unique" UNIQUE("plant_id","tag"),
	CONSTRAINT "assets_plant_fur_unique" UNIQUE("plant_id","fur_code")
);
--> statement-breakpoint
ALTER TABLE "core"."plant_settings" ADD COLUMN "asset_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" ADD CONSTRAINT "asset_models_asset_type_id_asset_types_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "catalog"."asset_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."asset_models" ADD CONSTRAINT "asset_models_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "catalog"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."asset_types" ADD CONSTRAINT "asset_types_family_id_asset_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "catalog"."asset_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."asset_networks" ADD CONSTRAINT "asset_networks_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."asset_networks" ADD CONSTRAINT "asset_networks_plant_network_id_plant_networks_id_fk" FOREIGN KEY ("plant_network_id") REFERENCES "plant"."plant_networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."asset_status_history" ADD CONSTRAINT "asset_status_history_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."asset_status_history" ADD CONSTRAINT "asset_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."assets" ADD CONSTRAINT "assets_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."assets" ADD CONSTRAINT "assets_plant_stage_id_plant_stages_id_fk" FOREIGN KEY ("plant_stage_id") REFERENCES "process"."plant_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."assets" ADD CONSTRAINT "assets_asset_model_id_asset_models_id_fk" FOREIGN KEY ("asset_model_id") REFERENCES "catalog"."asset_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset"."assets" ADD CONSTRAINT "assets_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "catalog"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_asset_status_history_asset" ON "asset"."asset_status_history" USING btree ("asset_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_assets_plant_stage" ON "asset"."assets" USING btree ("plant_id","plant_stage_id");--> statement-breakpoint
CREATE INDEX "idx_assets_plant_status" ON "asset"."assets" USING btree ("plant_id","status");