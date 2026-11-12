CREATE TABLE "budget"."catalog_publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"release_id" uuid NOT NULL,
	"label" text NOT NULL,
	"profile" text NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_publications_release_id_unique" UNIQUE("release_id")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"predecessor_id" uuid,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"input" jsonb NOT NULL,
	"catalog" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by" uuid,
	"issued_by" uuid,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_document_request" UNIQUE("plant_id","request_id"),
	CONSTRAINT "lulo_document_version" UNIQUE("group_id","version"),
	CONSTRAINT "lulo_document_code" UNIQUE("plant_id","code")
);
--> statement-breakpoint
ALTER TABLE "budget"."catalog_publications" ADD CONSTRAINT "catalog_publications_release_id_catalog_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "budget"."catalog_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_documents" ADD CONSTRAINT "lulo_documents_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_documents" ADD CONSTRAINT "lulo_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_documents" ADD CONSTRAINT "lulo_documents_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lulo_document_plant" ON "budget"."lulo_documents" USING btree ("plant_id","created_at");