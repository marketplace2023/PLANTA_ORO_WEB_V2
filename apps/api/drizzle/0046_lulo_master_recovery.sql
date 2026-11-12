CREATE TABLE "budget"."master_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"source" text NOT NULL,
	"recovery_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'STAGED' NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_batches_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "budget"."master_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"resource_type" text NOT NULL,
	"source_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"source_context" text NOT NULL,
	"status" text NOT NULL,
	"issues" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_master_entry_origin" UNIQUE("batch_id","kind","resource_type","code","source_context")
);
--> statement-breakpoint
ALTER TABLE "budget"."master_entries" ADD CONSTRAINT "master_entries_batch_id_master_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "budget"."master_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_master_entry_search" ON "budget"."master_entries" USING btree ("batch_id","kind","resource_type","code");--> statement-breakpoint
CREATE INDEX "budget_master_entry_status" ON "budget"."master_entries" USING btree ("batch_id","status");