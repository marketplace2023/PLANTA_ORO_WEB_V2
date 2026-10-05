CREATE TABLE "process"."stage_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"source_stage_id" uuid NOT NULL,
	"target_stage_id" uuid NOT NULL,
	"flow_type" varchar(20) DEFAULT 'MATERIAL' NOT NULL,
	"is_return_flow" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "stage_connections_unique" UNIQUE("source_stage_id","target_stage_id","flow_type"),
	CONSTRAINT "stage_connections_no_self_loop" CHECK ("process"."stage_connections"."source_stage_id" <> "process"."stage_connections"."target_stage_id")
);
--> statement-breakpoint
ALTER TABLE "process"."stage_connections" ADD CONSTRAINT "stage_connections_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process"."stage_connections" ADD CONSTRAINT "stage_connections_source_stage_id_plant_stages_id_fk" FOREIGN KEY ("source_stage_id") REFERENCES "process"."plant_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process"."stage_connections" ADD CONSTRAINT "stage_connections_target_stage_id_plant_stages_id_fk" FOREIGN KEY ("target_stage_id") REFERENCES "process"."plant_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stage_connections_plant" ON "process"."stage_connections" USING btree ("plant_id");