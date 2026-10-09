CREATE TABLE "catalog"."model_variable_values" (
	"asset_model_id" uuid NOT NULL,
	"variable_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_variable_values_asset_model_id_variable_id_pk" PRIMARY KEY("asset_model_id","variable_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."variable_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(60) NOT NULL,
	"label" varchar(160) NOT NULL,
	"unit" varchar(30),
	"value_type" varchar(20) NOT NULL,
	"network_master_id" uuid,
	"stage_master_id" uuid,
	"asset_type_id" uuid,
	"group_label" varchar(120),
	"is_key" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variable_definitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "catalog"."model_variable_values" ADD CONSTRAINT "model_variable_values_asset_model_id_asset_models_id_fk" FOREIGN KEY ("asset_model_id") REFERENCES "catalog"."asset_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."model_variable_values" ADD CONSTRAINT "model_variable_values_variable_id_variable_definitions_id_fk" FOREIGN KEY ("variable_id") REFERENCES "catalog"."variable_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."variable_definitions" ADD CONSTRAINT "variable_definitions_network_master_id_network_master_id_fk" FOREIGN KEY ("network_master_id") REFERENCES "plant"."network_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."variable_definitions" ADD CONSTRAINT "variable_definitions_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."variable_definitions" ADD CONSTRAINT "variable_definitions_asset_type_id_asset_types_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "catalog"."asset_types"("id") ON DELETE cascade ON UPDATE no action;