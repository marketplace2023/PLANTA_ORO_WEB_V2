CREATE TABLE "budget"."lulo_recalculation_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"hash" text NOT NULL,
	"input" jsonb NOT NULL,
	"catalog" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"committed_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_recalculation_hash" UNIQUE("document_id","hash")
);
--> statement-breakpoint
ALTER TABLE "budget"."lulo_recalculation_proposals" ADD CONSTRAINT "lulo_recalculation_proposals_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_recalculation_proposals" ADD CONSTRAINT "lulo_recalculation_proposals_document_id_lulo_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "budget"."lulo_documents"("id") ON DELETE cascade ON UPDATE no action;