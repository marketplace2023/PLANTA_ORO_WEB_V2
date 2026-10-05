CREATE SCHEMA "document";
--> statement-breakpoint
CREATE TABLE "document"."asset_documents" (
	"document_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"relation_type" varchar(40) DEFAULT 'GENERAL' NOT NULL,
	CONSTRAINT "asset_documents_document_id_asset_id_pk" PRIMARY KEY("document_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "document"."document_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"storage_key" text NOT NULL,
	"note" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_versions_document_id_version_unique" UNIQUE("document_id","version")
);
--> statement-breakpoint
CREATE TABLE "document"."documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"document_type" varchar(30) DEFAULT 'OTRO' NOT NULL,
	"visibility" varchar(20) DEFAULT 'INTERNAL' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document"."stage_documents" (
	"document_id" uuid NOT NULL,
	"plant_stage_id" uuid NOT NULL,
	CONSTRAINT "stage_documents_document_id_plant_stage_id_pk" PRIMARY KEY("document_id","plant_stage_id")
);
--> statement-breakpoint
ALTER TABLE "document"."asset_documents" ADD CONSTRAINT "asset_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "document"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document"."asset_documents" ADD CONSTRAINT "asset_documents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document"."document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "document"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document"."document_versions" ADD CONSTRAINT "document_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document"."documents" ADD CONSTRAINT "documents_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document"."documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document"."stage_documents" ADD CONSTRAINT "stage_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "document"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document"."stage_documents" ADD CONSTRAINT "stage_documents_plant_stage_id_plant_stages_id_fk" FOREIGN KEY ("plant_stage_id") REFERENCES "process"."plant_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_asset_documents_asset" ON "document"."asset_documents" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "idx_documents_plant_status" ON "document"."documents" USING btree ("plant_id","status");--> statement-breakpoint
CREATE INDEX "idx_documents_plant_type" ON "document"."documents" USING btree ("plant_id","document_type");