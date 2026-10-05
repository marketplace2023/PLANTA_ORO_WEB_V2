CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "iam";
--> statement-breakpoint
CREATE SCHEMA "plant";
--> statement-breakpoint
CREATE SCHEMA "process";
--> statement-breakpoint
CREATE TABLE "core"."ecosystems" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(30) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ecosystems_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "core"."plant_settings" (
	"plant_id" uuid PRIMARY KEY NOT NULL,
	"currency_code" varchar(3) DEFAULT 'USD' NOT NULL,
	"locale" varchar(10) DEFAULT 'es' NOT NULL,
	"units_system" varchar(20) DEFAULT 'METRIC' NOT NULL,
	"public_dashboard" boolean DEFAULT false NOT NULL,
	"public_assets" boolean DEFAULT false NOT NULL,
	"public_processes" boolean DEFAULT false NOT NULL,
	"public_documents" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."plants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ecosystem_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text,
	"country_code" varchar(2),
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"status" varchar(30) DEFAULT 'ACTIVE' NOT NULL,
	"visibility" varchar(20) DEFAULT 'PRIVATE' NOT NULL,
	"logo_url" text,
	"hero_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "iam"."permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"resource" varchar(60) NOT NULL,
	"action" varchar(60) NOT NULL,
	"code" varchar(120) NOT NULL,
	"description" text,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "iam"."role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "iam"."roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"scope" varchar(20) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "iam"."user_plant_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"effect" varchar(10) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iam"."user_plant_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'ACTIVE' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iam"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"username" varchar(100),
	"password_hash" text NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"status" varchar(30) DEFAULT 'ACTIVE' NOT NULL,
	"is_global_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "plant"."network_master" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"icon" varchar(40),
	"color_token" varchar(40),
	CONSTRAINT "network_master_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "plant"."plant_networks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"network_master_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "plant_networks_plant_id_network_master_id_unique" UNIQUE("plant_id","network_master_id")
);
--> statement-breakpoint
CREATE TABLE "process"."plant_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"stage_master_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"name_override" varchar(200),
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "plant_stages_plant_id_stage_master_id_unique" UNIQUE("plant_id","stage_master_id")
);
--> statement-breakpoint
CREATE TABLE "process"."stage_master" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(200) NOT NULL,
	"sequence_default" integer NOT NULL,
	"description" text,
	"stage_group" varchar(40) NOT NULL,
	"color_token" varchar(40),
	CONSTRAINT "stage_master_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "core"."plant_settings" ADD CONSTRAINT "plant_settings_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."plants" ADD CONSTRAINT "plants_ecosystem_id_ecosystems_id_fk" FOREIGN KEY ("ecosystem_id") REFERENCES "core"."ecosystems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "iam"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "iam"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."user_plant_overrides" ADD CONSTRAINT "user_plant_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."user_plant_overrides" ADD CONSTRAINT "user_plant_overrides_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."user_plant_overrides" ADD CONSTRAINT "user_plant_overrides_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "iam"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."user_plant_roles" ADD CONSTRAINT "user_plant_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."user_plant_roles" ADD CONSTRAINT "user_plant_roles_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."user_plant_roles" ADD CONSTRAINT "user_plant_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "iam"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant"."plant_networks" ADD CONSTRAINT "plant_networks_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant"."plant_networks" ADD CONSTRAINT "plant_networks_network_master_id_network_master_id_fk" FOREIGN KEY ("network_master_id") REFERENCES "plant"."network_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process"."plant_stages" ADD CONSTRAINT "plant_stages_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process"."plant_stages" ADD CONSTRAINT "plant_stages_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE no action ON UPDATE no action;