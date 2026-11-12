CREATE TABLE "budget"."lulo_references" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"dimension" text NOT NULL,
	"notes" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_reference_code" UNIQUE("plant_id","kind","code")
);
--> statement-breakpoint
ALTER TABLE "budget"."lulo_references" ADD CONSTRAINT "lulo_references_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;