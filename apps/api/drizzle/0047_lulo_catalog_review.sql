CREATE TABLE "budget"."catalog_release_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"release_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"resource_type" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "budget_catalog_release_entry" UNIQUE("release_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "budget"."catalog_releases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"state" text DEFAULT 'DRAFT' NOT NULL,
	"usage" text DEFAULT 'REFERENCE_ONLY' NOT NULL,
	"content_hash" text NOT NULL,
	"root_ids" jsonb NOT NULL,
	"entry_count" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	CONSTRAINT "budget_catalog_release_version" UNIQUE("batch_id","version")
);
--> statement-breakpoint
CREATE TABLE "budget"."master_reviews" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"state" text NOT NULL,
	"draft" jsonb NOT NULL,
	"dependencies" jsonb NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget"."catalog_release_entries" ADD CONSTRAINT "catalog_release_entries_release_id_catalog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "budget"."catalog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."catalog_releases" ADD CONSTRAINT "catalog_releases_batch_id_master_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "budget"."master_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."master_reviews" ADD CONSTRAINT "master_reviews_entry_id_master_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "budget"."master_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_catalog_release_search" ON "budget"."catalog_release_entries" USING btree ("release_id","code");