CREATE SCHEMA "provider";
--> statement-breakpoint
CREATE SCHEMA "marketplace";
--> statement-breakpoint
CREATE SCHEMA "professional";
--> statement-breakpoint
CREATE TABLE "provider"."provider_asset_families" (
	"provider_id" uuid NOT NULL,
	"asset_family_id" uuid NOT NULL,
	CONSTRAINT "provider_asset_families_provider_id_asset_family_id_pk" PRIMARY KEY("provider_id","asset_family_id")
);
--> statement-breakpoint
CREATE TABLE "provider"."provider_members" (
	"provider_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_members_provider_id_user_id_pk" PRIMARY KEY("provider_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "provider"."provider_stage_capabilities" (
	"provider_id" uuid NOT NULL,
	"stage_master_id" uuid NOT NULL,
	CONSTRAINT "provider_stage_capabilities_provider_id_stage_master_id_pk" PRIMARY KEY("provider_id","stage_master_id")
);
--> statement-breakpoint
CREATE TABLE "provider"."providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_name" varchar(200) NOT NULL,
	"tax_id" varchar(40),
	"country_code" varchar(2) NOT NULL,
	"city" varchar(120),
	"description" text,
	"website" text,
	"contact_email" varchar(255),
	"logo_url" text,
	"certifications" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"rating" numeric(3, 2),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_country_tax_unique" UNIQUE("country_code","tax_id"),
	CONSTRAINT "providers_rating_range" CHECK ("provider"."providers"."rating" is null or ("provider"."providers"."rating" >= 0 and "provider"."providers"."rating" <= 5))
);
--> statement-breakpoint
CREATE TABLE "marketplace"."listing_stages" (
	"listing_id" uuid NOT NULL,
	"stage_master_id" uuid NOT NULL,
	CONSTRAINT "listing_stages_listing_id_stage_master_id_pk" PRIMARY KEY("listing_id","stage_master_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace"."listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" uuid NOT NULL,
	"asset_model_id" uuid,
	"asset_family_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"price" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"availability" varchar(20) DEFAULT 'ON_REQUEST' NOT NULL,
	"stock_text" varchar(120),
	"image_url" text,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional"."contractor_members" (
	"contractor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_members_contractor_id_user_id_pk" PRIMARY KEY("contractor_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "professional"."contractors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_name" varchar(200) NOT NULL,
	"tax_id" varchar(40),
	"country_code" varchar(2) NOT NULL,
	"city" varchar(120),
	"description" text,
	"website" text,
	"contact_email" varchar(255),
	"logo_url" text,
	"certifications" text[] DEFAULT '{}'::text[] NOT NULL,
	"availability" varchar(20) DEFAULT 'AVAILABLE' NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"rating" numeric(3, 2),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractors_country_tax_unique" UNIQUE("country_code","tax_id"),
	CONSTRAINT "contractors_rating_range" CHECK ("professional"."contractors"."rating" is null or ("professional"."contractors"."rating" >= 0 and "professional"."contractors"."rating" <= 5))
);
--> statement-breakpoint
CREATE TABLE "professional"."service_stages" (
	"service_id" uuid NOT NULL,
	"stage_master_id" uuid NOT NULL,
	CONSTRAINT "service_stages_service_id_stage_master_id_pk" PRIMARY KEY("service_id","stage_master_id")
);
--> statement-breakpoint
CREATE TABLE "professional"."services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contractor_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"service_type" varchar(80) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider"."provider_asset_families" ADD CONSTRAINT "provider_asset_families_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."provider_asset_families" ADD CONSTRAINT "provider_asset_families_asset_family_id_asset_families_id_fk" FOREIGN KEY ("asset_family_id") REFERENCES "catalog"."asset_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."provider_members" ADD CONSTRAINT "provider_members_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."provider_members" ADD CONSTRAINT "provider_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."provider_stage_capabilities" ADD CONSTRAINT "provider_stage_capabilities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."provider_stage_capabilities" ADD CONSTRAINT "provider_stage_capabilities_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."providers" ADD CONSTRAINT "providers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_stages" ADD CONSTRAINT "listing_stages_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_stages" ADD CONSTRAINT "listing_stages_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_asset_model_id_asset_models_id_fk" FOREIGN KEY ("asset_model_id") REFERENCES "catalog"."asset_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_asset_family_id_asset_families_id_fk" FOREIGN KEY ("asset_family_id") REFERENCES "catalog"."asset_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."contractor_members" ADD CONSTRAINT "contractor_members_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "professional"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."contractor_members" ADD CONSTRAINT "contractor_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."contractors" ADD CONSTRAINT "contractors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."service_stages" ADD CONSTRAINT "service_stages_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "professional"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."service_stages" ADD CONSTRAINT "service_stages_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."services" ADD CONSTRAINT "services_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "professional"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_provider_members_user" ON "provider"."provider_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_providers_status" ON "provider"."providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_listings_provider" ON "marketplace"."listings" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_listings_status_family" ON "marketplace"."listings" USING btree ("status","asset_family_id");--> statement-breakpoint
CREATE INDEX "idx_contractor_members_user" ON "professional"."contractor_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_contractors_status" ON "professional"."contractors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_services_contractor" ON "professional"."services" USING btree ("contractor_id");